// src/server/routers/bookings.ts
import { router, protectedProcedure, publicProcedure } from "@/lib/trpcServer"
import type { Context } from "@/server/context"
import { z } from "zod"
import { BookingStatus, Prisma, ItemType, NotificationType, LogType } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { format, parseISO } from "date-fns" // format for notes
import { logAction } from "@/lib/logger"
import { notificationEmitter } from "@/lib/notifications"

// Helper (already defined)
const isRentalTeamMember = (ctx: Context) => {
  const role = ctx.session?.user?.role
  return role === "RENTAL" || role === "ADMIN"
}

async function notifyStatusChange(
  ctx: Context,
  booking: { id: string; userId: string; assignedToId: string | null; itemTitle: string },
  status: BookingStatus,
) {
  const recipients = Array.from(
    new Set([booking.userId, booking.assignedToId].filter((id): id is string => Boolean(id))),
  )
  if (!recipients.length) return
  const messageMap: Record<BookingStatus, string> = {
    REQUESTED: "notifications.status.requested",
    ACCEPTED: "notifications.status.accepted",
    DECLINED: "notifications.status.declined",
    BORROWED: "notifications.status.borrowed",
    COMPLETED: "notifications.status.completed",
    CANCELLED: "notifications.status.cancelled",
  }
  for (const id of recipients) {
    const n = await ctx.prisma.notification.create({
      data: {
        userId: id,
        bookingId: booking.id,
        type: NotificationType.BOOKING_RESPONSE,
        message: JSON.stringify({
          key: messageMap[status],
          vars: { item: booking.itemTitle },
        }),
      },
    })
    notificationEmitter.emit("new", n)
  }
}

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
        select: { userId: true, status: true, startDate: true },
      })
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." })
      if (booking.userId !== ctx.session.user.id && !isRentalTeamMember(ctx)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Action not allowed." })
      }
      // Allow cancellation for requested and accepted bookings
      if (booking.status !== BookingStatus.REQUESTED && booking.status !== BookingStatus.ACCEPTED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bookings with status "${booking.status}" cannot be cancelled.`,
        })
      }
      const updated = await ctx.prisma.booking.update({
        where: { id: input.id },
        data: { status: BookingStatus.CANCELLED },
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
        rentalNotes: z.string().optional(),
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

      if (
        input.newStatus === BookingStatus.CANCELLED &&
        booking.status === BookingStatus.BORROWED &&
        !input.rentalNotes?.trim()
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Notes required when cancelling a borrowed booking.",
        })
      }

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
          notes: input.rentalNotes
            ? `${booking.notes ? booking.notes + "\n\n" : ""}Rental Team (${format(new Date(), "yyyy-MM-dd HH:mm")}):\n${input.rentalNotes}`
            : booking.notes,
          assignedTo: assignedToUpdate, // Update assignedTo if applicable
        },
        include: { item: { select: { titleEn: true } } },
      })
      await notifyStatusChange(
        ctx,
        {
          id: updated.id,
          userId: updated.userId,
          assignedToId: updated.assignedToId,
          itemTitle: updated.item.titleEn,
        },
        input.newStatus,
      )
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
export type BookingForRentalTeam = Omit<
  Prisma.BookingGetPayload<{
    include: {
      item: { select: { id: true; titleEn: true; titleDe: true; type: true; totalQuantity: true } }
      user: { select: { id: true; name: true; email: true } }
      assignedTo: { select: { id: true; name: true; email: true } }
    }
  }>,
  "item"
> & {
  item: {
    id: string
    titleEn: string
    titleDe: string | null
    type: ItemType | null
    totalQuantity: number
  } | null
}

export type CalendarBooking = Omit<
  Prisma.BookingGetPayload<{
    include: {
      item: { select: { id: true; titleEn: true; titleDe: true; type: true; totalQuantity: true } }
      user: { select: { id: true; name: true; email: true } }
    }
  }>,
  "item"
> & {
  item: {
    id: string
    titleEn: string
    titleDe: string | null
    type: ItemType | null
    totalQuantity: number
  } | null
}
