// src/server/routers/bookings.ts
import { router, protectedProcedure, publicProcedure } from "@/lib/trpcServer"
import type { Context } from "@/server/context"
import { z } from "zod"
import { BookingStatus, Prisma, LogType } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { format, parseISO, differenceInCalendarDays } from "date-fns" // format for notes
import { logAction } from "@/lib/logger"
import { notifyBookingStatusChange } from "@/server/notifications/bookingStatusNotifier"

// Helper (already defined)
const isRentalTeamMember = (ctx: Context) => {
  const role = ctx.session?.user?.role
  return role === "RENTAL" || role === "ADMIN"
}


type NotificationRecipient = {
  id: string
  email?: string | null
  name?: string | null
}

const filterRecipients = (
  recipients: Array<NotificationRecipient | null | undefined>,
): NotificationRecipient[] =>
  recipients.filter((recipient): recipient is NotificationRecipient =>
    Boolean(recipient && recipient.id),
  )

const DEFAULT_MAX_RANGE_DAYS = 1
const RENTAL_MAX_RANGE_DAYS = 13

export const bookingsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(BookingStatus).optional(),
        all: z.boolean().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const where: Prisma.BookingWhereInput = {}
      if (input.status) where.status = input.status

      // This is for "My Bookings" page.
      // If 'all' is true AND user is rental/admin, it shows all bookings.
      // Otherwise, it's restricted to the current user's bookings.
      if (!(input.all && isRentalTeamMember(ctx))) {
        where.userId = ctx.session.user.id
      }

      return ctx.prisma.booking.findMany({
        where,
        include: {
          item: true, // Item details are needed for display
          user: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
        orderBy: { startDate: "asc" },
      })
    }),

  create: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        quantity: z.number().int().min(1).default(1),
        start: z.string(), // ISO string
        end: z.string(), // ISO string
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const startDate = parseISO(input.start)
      const endDate = parseISO(input.end)
      if (endDate <= startDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be after start date." })
      }
      // Add validation: Prevent booking in the past
      if (startDate < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot book a time in the past." })
      }

      const maxRangeDays = isRentalTeamMember(ctx) ? RENTAL_MAX_RANGE_DAYS : DEFAULT_MAX_RANGE_DAYS
      if (
        Number.isFinite(maxRangeDays) &&
        differenceInCalendarDays(endDate, startDate) > maxRangeDays
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Booking range cannot exceed ${maxRangeDays + 1} days.`,
        })
      }

      const item = await ctx.prisma.item.findUnique({
        where: { id: input.itemId },
        select: { totalQuantity: true },
      })
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." })

      const used = await ctx.prisma.booking.aggregate({
        where: {
          itemId: input.itemId,
          status: { in: [BookingStatus.ACCEPTED, BookingStatus.BORROWED] },
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        _sum: { quantity: true },
      })

      const alreadyUsed = used._sum.quantity ?? 0
      if (alreadyUsed + input.quantity > item.totalQuantity) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not enough units available for that time.",
        })
      }

      return ctx.prisma.booking.create({
        data: {
          userId: ctx.session.user.id,
          itemId: input.itemId,
          quantity: input.quantity,
          startDate,
          endDate,
          status: BookingStatus.REQUESTED,
          notes: input.notes ?? null,
        },
      })
    }),

  // User updating their own booking
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        start: z.string(), // ISO string
        end: z.string(), // ISO string
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const startDate = parseISO(input.start)
      const endDate = parseISO(input.end)

      if (endDate <= startDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "End date must be after start date." })
      }
      if (startDate < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot update booking to a time in the past.",
        })
      }

      const maxRangeDays = isRentalTeamMember(ctx) ? RENTAL_MAX_RANGE_DAYS : DEFAULT_MAX_RANGE_DAYS
      if (
        Number.isFinite(maxRangeDays) &&
        differenceInCalendarDays(endDate, startDate) > maxRangeDays
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Booking range cannot exceed ${maxRangeDays + 1} days.`,
        })
      }

      const booking = await ctx.prisma.booking.findUnique({
        where: { id: input.id },
        select: { userId: true, status: true }, // Select only needed fields
      })

      if (!booking) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." })
      }

      // Allow update only if user is the owner AND booking is REQUESTED or ACCEPTED
      // If ACCEPTED, updating it should revert status to REQUESTED.
      if (booking.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only update your own bookings.",
        })
      }
      if (booking.status !== BookingStatus.REQUESTED && booking.status !== BookingStatus.ACCEPTED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bookings with status "${booking.status}" cannot be updated by user.`,
        })
      }

      const newStatus = BookingStatus.REQUESTED // Always revert to REQUESTED on user update

      return ctx.prisma.booking.update({
        where: { id: input.id },
        data: {
          startDate,
          endDate,
          notes: input.notes, // Prisma handles undefined by not updating if input.notes is undefined
          status: newStatus,
        },
      })
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const booking = await ctx.prisma.booking.findUnique({
        where: { id: input.id },
        include: {
          item: { select: { titleEn: true } },
          user: { select: { id: true, email: true, name: true } },
          assignedTo: { select: { id: true, email: true, name: true } },
        },
      })
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." })
      if (booking.userId !== ctx.session.user.id && !isRentalTeamMember(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Action not allowed." })
      }
      if (booking.status !== BookingStatus.REQUESTED && booking.status !== BookingStatus.ACCEPTED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bookings with status "${booking.status}" cannot be cancelled.`,
        })
      }

      const updated = await ctx.prisma.booking.update({
        where: { id: input.id },
        data: { status: BookingStatus.CANCELLED },
        include: {
          item: { select: { titleEn: true } },
          user: { select: { id: true, email: true, name: true } },
          assignedTo: { select: { id: true, email: true, name: true } },
        },
      })

      await notifyBookingStatusChange({
        prisma: ctx.prisma,
        bookingId: updated.id,
        status: BookingStatus.CANCELLED,
        itemTitle: updated.item.titleEn,
        startDate: updated.startDate,
        endDate: updated.endDate,
        notes: updated.notes,
        recipients: filterRecipients([
          { id: updated.userId, email: updated.user.email, name: updated.user.name },
          updated.assignedTo
            ? { id: updated.assignedTo.id, email: updated.assignedTo.email, name: updated.assignedTo.name }
            : null,
        ]),
      })

      await logAction({
        type: LogType.BOOKING,
        userId: ctx.session.user.id,
        bookingId: updated.id,
        message: "status:CANCELLED",
      })
      return updated
    }),

  // listForRentalTeam - (already good, minor type safety from Prisma)
  listForRentalTeam: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(BookingStatus).optional(),
        searchTerm: z.string().optional(),
        limit: z.number().min(1).max(100).nullish().default(25),
        cursor: z.string().nullish(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!isRentalTeamMember(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." })
      }

      const whereClause: Prisma.BookingWhereInput = {}
      if (ctx.session.user.role !== "ADMIN") {
        whereClause.item = { responsibleMembers: { some: { id: ctx.session.user.id } } }
      }
      if (input.status) {
        whereClause.status = input.status
      } else {
        // Default: Show active, actionable bookings
        whereClause.status = {
          in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED],
        }
      }

      if (input.searchTerm) {
        whereClause.AND = [
          // Ensure AND is an array if other conditions exist
          ...(Array.isArray(whereClause.AND)
            ? whereClause.AND
            : whereClause.AND
              ? [whereClause.AND]
              : []),
          {
            OR: [
              { item: { titleEn: { contains: input.searchTerm } } },
              { item: { titleDe: { contains: input.searchTerm } } },
              { user: { name: { contains: input.searchTerm } } },
              { user: { email: { contains: input.searchTerm } } },
            ],
          },
        ]
      }
      const bookings = await ctx.prisma.booking.findMany({
        where: whereClause,
        include: {
          item: {
            select: { id: true, titleEn: true, titleDe: true, type: true, totalQuantity: true },
          }, // Include totalQuantity
          user: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } }, // Include assignedTo if rental team assigns bookings
        },
        orderBy: [{ status: "asc" }, { startDate: "asc" }], // REQUESTED first, then by date
        take: (input.limit ?? 25) + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      })

      let nextCursor: string | undefined = undefined
      const limit = input.limit ?? 25
      if (bookings.length > limit) {
        const nextItem = bookings.pop()
        nextCursor = nextItem!.id
      }
      return { bookings, nextCursor }
    }),

  addRentalNote: protectedProcedure
    .input(
      z.object({
        bookingId: z.string(),
        note: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!isRentalTeamMember(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." })
      }

      const trimmedNote = input.note.trim()
      if (!trimmedNote) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Note cannot be empty." })
      }

      const booking = await ctx.prisma.booking.findUnique({
        where: { id: input.bookingId },
        select: { id: true, notes: true },
      })
      if (!booking) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." })
      }

      const noteEntry = [
        `Rental Team (${format(new Date(), "yyyy-MM-dd HH:mm")}):`,
        trimmedNote,
      ].join("\n")
      const updatedNotes = booking.notes ? [booking.notes, noteEntry].join("\n\n") : noteEntry

      const updated = await ctx.prisma.booking.update({
        where: { id: input.bookingId },
        data: { notes: updatedNotes },
      })

      await logAction({
        type: LogType.BOOKING,
        userId: ctx.session.user.id,
        bookingId: updated.id,
        message: "notes:added",
      })

      return updated
    }),

  // updateBookingStatusByTeam - (already good, minor type safety)
  updateBookingStatusByTeam: protectedProcedure
    .input(
      z.object({
        bookingId: z.string(),
        newStatus: z.nativeEnum(BookingStatus),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!isRentalTeamMember(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." })
      }
      const booking = await ctx.prisma.booking.findUnique({
        where: { id: input.bookingId },
        include: { item: { select: { titleEn: true } } },
      })
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." })

      if (input.newStatus === BookingStatus.COMPLETED && booking.startDate > new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot mark booking as completed before it begins.",
        })
      }

      // Add any specific business logic for status transitions by team
      // e.g. if newStatus is BORROWED, assign self to assignedToId
      let assignedToUpdate: Prisma.BookingUpdateInput["assignedTo"] = undefined
      if (input.newStatus === BookingStatus.BORROWED && !booking.assignedToId) {
        assignedToUpdate = { connect: { id: ctx.session.user.id } }
      }

      const updated = await ctx.prisma.booking.update({
        where: { id: input.bookingId },
        data: {
          status: input.newStatus,
          assignedTo: assignedToUpdate,
        },
        include: {
          item: { select: { titleEn: true } },
          user: { select: { id: true, email: true, name: true } },
          assignedTo: { select: { id: true, email: true, name: true } },
        },
      })

      await notifyBookingStatusChange({
        prisma: ctx.prisma,
        bookingId: updated.id,
        status: input.newStatus,
        itemTitle: updated.item.titleEn,
        startDate: updated.startDate,
        endDate: updated.endDate,
        notes: updated.notes,
        recipients: filterRecipients([
          { id: updated.userId, email: updated.user.email, name: updated.user.name },
          updated.assignedTo
            ? { id: updated.assignedTo.id, email: updated.assignedTo.email, name: updated.assignedTo.name }
            : null,
        ]),
      })
      await logAction({
        type: LogType.BOOKING,
        userId: ctx.session.user.id,
        bookingId: updated.id,
        message: `status:${input.newStatus}`,
      })
      return updated
    }),

  listForRentalCalendar: protectedProcedure
    .input(
      z.object({
        from: z.string(),
        to: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!isRentalTeamMember(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." })
      }
      const from = parseISO(input.from)
      const to = parseISO(input.to)
      const bookings = await ctx.prisma.booking.findMany({
        where: {
          item: { responsibleMembers: { some: { id: ctx.session.user.id } } },
          AND: [{ startDate: { lte: to } }, { endDate: { gte: from } }],
        },
        include: {
          item: {
            select: { id: true, titleEn: true, titleDe: true, type: true, totalQuantity: true },
          },
          user: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
        orderBy: { startDate: "asc" },
      })
      return bookings
    }),

  getBookings: protectedProcedure
    .input(
      z.object({
        start: z.date(),
        end: z.date(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const where: Prisma.BookingWhereInput = {
        AND: [{ startDate: { lte: input.end } }, { endDate: { gte: input.start } }],
      }

      const role = ctx.session.user.role
      if (role === "ADMIN") {
        // no additional filter
      } else if (role === "RENTAL") {
        where.item = { responsibleMembers: { some: { id: ctx.session.user.id } } }
      } else {
        where.userId = ctx.session.user.id
      }
      const bookings = await ctx.prisma.booking.findMany({
        where,
        include: {
          item: {
            select: { id: true, titleEn: true, titleDe: true, type: true, totalQuantity: true },
          },
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { startDate: "asc" },
      })
      return bookings
    }),

  availability: publicProcedure /* Unchanged from previous correct version */
    .input(
      z.object({
        itemId: z.string(),
        from: z.string(),
        to: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const queryStartBoundary = parseISO(input.from)
      const queryEndBoundary = parseISO(input.to)
      const bookings = await ctx.prisma.booking.findMany({
        where: {
          itemId: input.itemId,
          status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED] },
          AND: [{ startDate: { lte: queryEndBoundary } }, { endDate: { gte: queryStartBoundary } }],
        },
        select: { id: true, startDate: true, endDate: true, status: true, quantity: true },
      })
      return bookings
    }),
})

// Updated type export to use correct Item fields
export type { BookingForRentalTeam, CalendarBooking } from "@/types/booking"
