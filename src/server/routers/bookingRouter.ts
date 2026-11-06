import { router, protectedProcedure, publicProcedure } from "@/lib/trpcServer"
import type { Context } from "@/server/context"
import { z } from "zod"
import { BookingStatus, Prisma, ItemType, LogType, NotificationType } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { parseISO, differenceInCalendarDays } from "date-fns"
import { berlinContext, formatInBerlin } from "@/lib/berlin-time"
import { logAction } from "@/lib/logger"
import { notifyBookingStatusChange } from "@/server/notifications/bookingStatusNotifier"
import { notificationEmitter } from "@/lib/notifications"
import { sendBookingRequestEmail } from "@/server/email/sendBookingRequestEmail"
import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"
import { markUpcomingBookingsBorrowed } from "@/server/jobs/autoBorrowed"
import { usesAdminBlockPrefix } from "@/utils/adminBlock"
import {
  assertDateRange,
  bookingTransaction,
  customerNotes,
  legacyStaffNotes,
  ownerBooking,
  staffBooking,
} from "@/server/bookingSecurity"
import { consumeBudget } from "@/lib/auth/state"
import { BLOCK_TIME_ZONE, isBlockOccurrence, validateBlockRecurrence } from "@/lib/recurring-blocks"
import {
  assertBlockPreservesBookings,
  assertBookingCapacity,
  blockOccurrences,
  MAX_BLOCK_RULES_PER_ITEM,
  requireBlockItem,
  requireBlockStaff,
} from "@/server/recurringBlocks"

const isRentalTeamMember = (ctx: Context) => {
  const role = ctx.session?.user?.role
  return role === "RENTAL" || role === "ADMIN"
}

type BookingRentalScope = {
  assignedToId?: string | null
  item?: {
    responsibleMembers?: Array<{ id: string }> | null
  } | null
}

const canManageScopedBooking = (ctx: Context, booking: BookingRentalScope) => {
  const user = ctx.session?.user
  if (!user?.id) return false
  if (user.role === "ADMIN") return true
  if (user.role !== "RENTAL") return false
  if (booking.assignedToId === user.id) return true
  return Boolean(booking.item?.responsibleMembers?.some((member) => member.id === user.id))
}

const assertCanManageScopedBooking = (ctx: Context, booking: BookingRentalScope) => {
  if (!canManageScopedBooking(ctx, booking)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Action not allowed." })
  }
}

const assertUserNotesDoNotUseAdminBlockPrefix = (notes?: string | null) => {
  if (usesAdminBlockPrefix(notes) || /(?:^|\n)\s*Rental Team \(/.test(notes ?? "")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notes cannot use reserved admin block syntax.",
    })
  }
}

const canTeamTransitionStatus = (
  currentStatus: BookingStatus,
  nextStatus: BookingStatus,
  startDate: Date,
  now: Date,
) => {
  switch (currentStatus) {
    case BookingStatus.REQUESTED:
      return nextStatus === BookingStatus.ACCEPTED || nextStatus === BookingStatus.DECLINED
    case BookingStatus.ACCEPTED:
      return (
        nextStatus === BookingStatus.CANCELLED ||
        (nextStatus === BookingStatus.BORROWED &&
          startDate.getTime() <= now.getTime() + 4 * 60 * 60 * 1000)
      )
    case BookingStatus.BORROWED:
      return (
        nextStatus === BookingStatus.CANCELLED ||
        (nextStatus === BookingStatus.COMPLETED && startDate <= now)
      )
    default:
      return false
  }
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

      if (input.all && ctx.session.user.role === "ADMIN") {
        // Admins can review the full booking inventory.
      } else if (input.all && ctx.session.user.role === "RENTAL") {
        where.OR = [
          { assignedToId: ctx.session.user.id },
          { item: { responsibleMembers: { some: { id: ctx.session.user.id } } } },
        ]
      } else {
        where.userId = ctx.session.user.id
      }

      const bookings = await ctx.prisma.booking.findMany({
        where,
        include: {
          item: true, // Item details are needed for display
          user: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
        orderBy: { startDate: "asc" },
      })
      return bookings.map(input.all && isRentalTeamMember(ctx) ? staffBooking : ownerBooking)
    }),

  create: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        quantity: z.number().int().min(1).default(1),
        start: z.string(), // ISO string
        end: z.string(), // ISO string
        notes: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      assertUserNotesDoNotUseAdminBlockPrefix(input.notes)

      if (
        !(await consumeBudget("booking-create-user", ctx.session.user.id, 20, 86400000, ctx.prisma))
      ) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Booking request limit reached.",
        })
      }

      const startDate = parseISO(input.start)
      const endDate = parseISO(input.end)
      assertDateRange(startDate, endDate, 14)
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
        differenceInCalendarDays(endDate, startDate, berlinContext) > maxRangeDays
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Booking range cannot exceed ${maxRangeDays + 1} days.`,
        })
      }

      const { item, booking } = await bookingTransaction(ctx.prisma, async (tx) => {
        const item = await tx.item.findUnique({
          where: { id: input.itemId },
          select: {
            type: true,
            totalQuantity: true,
            active: true,
            titleEn: true,
            titleDe: true,
            responsibleMembers: {
              select: {
                id: true,
                email: true,
                name: true,
                emailBookingNotifications: true,
              },
            },
          },
        })
        if (!item || !item.active)
          throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." })

        const recentCount = await tx.booking.count({
          where: {
            userId: ctx.session.user.id,
            createdAt: { gt: new Date(Date.now() - 86400000) },
          },
        })
        const pendingCount = await tx.booking.count({
          where: { userId: ctx.session.user.id, status: BookingStatus.REQUESTED },
        })
        if (recentCount >= 20 || pendingCount >= 20) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Booking request limit reached.",
          })
        }
        const duplicate = await tx.booking.findFirst({
          where: {
            userId: ctx.session.user.id,
            itemId: input.itemId,
            startDate,
            endDate,
            status: {
              in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED],
            },
          },
        })
        if (duplicate)
          throw new TRPCError({ code: "CONFLICT", message: "This booking already exists." })

        if (item.type === "ROOM" && !input.notes?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Notes are required for room bookings.",
          })
        }

        await assertBookingCapacity(
          tx,
          {
            itemId: input.itemId,
            startDate,
            endDate,
            quantity: input.quantity,
            totalQuantity: item.totalQuantity,
          },
          "BAD_REQUEST",
        )

        const booking = await tx.booking.create({
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
        return { item, booking }
      })

      const responsibleMembers = item.responsibleMembers ?? []
      if (responsibleMembers.length > 0) {
        const itemTitle = item.titleEn || item.titleDe || "Booking"

        const notificationPayload = JSON.stringify({
          key: "notifications.bookingRequest",
          vars: { item: itemTitle },
        })

        const requester = await ctx.prisma.user.findUnique({
          where: { id: ctx.session.user.id },
          select: { name: true, email: true },
        })

        await Promise.allSettled(
          responsibleMembers.map(async (member) => {
            if (!member?.id) return

            try {
              const notification = await ctx.prisma.notification.create({
                data: {
                  userId: member.id,
                  actorId: ctx.session.user.id,
                  bookingId: booking.id,
                  type: NotificationType.BOOKING_REQUEST,
                  message: notificationPayload,
                },
              })
              notificationEmitter.emit("new", notification)
            } catch (error) {
              console.error("[notifications] Failed to store booking request notification", error)
            }

            const wantsEmail = member.emailBookingNotifications ?? true
            if (member.email && wantsEmail) {
              try {
                await sendBookingRequestEmail({
                  to: { email: member.email, name: member.name },
                  requester: {
                    email: requester?.email,
                    name: requester?.name,
                  },
                  booking: {
                    itemTitle,
                    startDate,
                    endDate,
                    notes: input.notes,
                  },
                })
              } catch (error) {
                console.error("[mail] Booking request email failed", error)
              }
            }
          }),
        )
      }

      return booking
    }),

  // User updating their own booking
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        start: z.string(), // ISO string
        end: z.string(), // ISO string
        notes: z.string().max(5000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      assertUserNotesDoNotUseAdminBlockPrefix(input.notes)

      const startDate = parseISO(input.start)
      const endDate = parseISO(input.end)
      assertDateRange(startDate, endDate, 14)

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
        differenceInCalendarDays(endDate, startDate, berlinContext) > maxRangeDays
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Booking range cannot exceed ${maxRangeDays + 1} days.`,
        })
      }

      return bookingTransaction(ctx.prisma, async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: input.id },
          select: {
            userId: true,
            itemId: true,
            quantity: true,
            status: true,
            notes: true,
            staffNotes: true,
            item: { select: { active: true, totalQuantity: true } },
          },
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
        if (
          booking.status !== BookingStatus.REQUESTED &&
          booking.status !== BookingStatus.ACCEPTED
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Bookings with status "${booking.status}" cannot be updated by user.`,
          })
        }

        if (usesAdminBlockPrefix(booking.notes)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Availability blocks cannot be edited as bookings.",
          })
        }
        if (!booking.item.active)
          throw new TRPCError({ code: "BAD_REQUEST", message: "Item is inactive." })
        await assertBookingCapacity(
          tx,
          {
            itemId: booking.itemId,
            startDate,
            endDate,
            quantity: booking.quantity,
            totalQuantity: booking.item.totalQuantity,
            excludeBookingId: input.id,
          },
          "BAD_REQUEST",
        )

        const newStatus = BookingStatus.REQUESTED // Always revert to REQUESTED on user update

        return ownerBooking(
          await tx.booking.update({
            where: { id: input.id },
            data: {
              startDate,
              endDate,
              notes: input.notes ?? customerNotes(booking.notes),
              staffNotes:
                [legacyStaffNotes(booking.notes), booking.staffNotes]
                  .filter(Boolean)
                  .join("\n\n") || null,
              status: newStatus,
            },
          }),
        )
      })
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const updated = await bookingTransaction(ctx.prisma, async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: input.id },
          include: {
            item: {
              select: {
                titleEn: true,
                responsibleMembers: { select: { id: true } },
              },
            },
            user: { select: { id: true, email: true, name: true } },
            assignedTo: { select: { id: true, email: true, name: true } },
          },
        })
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." })
        if (usesAdminBlockPrefix(booking.notes)) {
          await requireBlockItem(tx, ctx.session.user.id, booking.itemId)
        } else if (booking.userId !== ctx.session.user.id) {
          assertCanManageScopedBooking(ctx, booking)
        }
        if (
          booking.status !== BookingStatus.REQUESTED &&
          booking.status !== BookingStatus.ACCEPTED
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Bookings with status "${booking.status}" cannot be cancelled.`,
          })
        }

        return tx.booking.update({
          where: { id: input.id },
          data: { status: BookingStatus.CANCELLED },
          include: {
            item: { select: { titleEn: true } },
            user: { select: { id: true, email: true, name: true } },
            assignedTo: { select: { id: true, email: true, name: true } },
          },
        })
      })

      await notifyBookingStatusChange({
        prisma: ctx.prisma,
        bookingId: updated.id,
        status: BookingStatus.CANCELLED,
        itemTitle: updated.item.titleEn,
        startDate: updated.startDate,
        endDate: updated.endDate,
        notes: customerNotes(updated.notes),
        recipients: filterRecipients([
          { id: updated.userId, email: updated.user.email, name: updated.user.name },
          updated.assignedTo
            ? {
                id: updated.assignedTo.id,
                email: updated.assignedTo.email,
                name: updated.assignedTo.name,
              }
            : null,
        ]),
        performedBy: {
          id: ctx.session.user.id,
          name: ctx.session.user.name ?? null,
          email: ctx.session.user.email ?? null,
        },
      })

      await logAction({
        type: LogType.BOOKING,
        userId: ctx.session.user.id,
        bookingId: updated.id,
        message: "status:CANCELLED",
      })
      return ownerBooking(updated)
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

      await markUpcomingBookingsBorrowed()

      const whereClause: Prisma.BookingWhereInput = {}
      if (ctx.session.user.role !== "ADMIN") {
        whereClause.item = { responsibleMembers: { some: { id: ctx.session.user.id } } }
      }
      if (input.status) {
        whereClause.status = input.status
        if (input.status === BookingStatus.ACCEPTED) {
          whereClause.NOT = {
            notes: { startsWith: ADMIN_BLOCK_PREFIX },
          }
        }
      } else {
        // Default: Show active, actionable bookings
        whereClause.status = {
          in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED],
        }
        whereClause.NOT = {
          notes: { startsWith: ADMIN_BLOCK_PREFIX },
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
      return { bookings: bookings.map(staffBooking), nextCursor }
    }),

  addRentalNote: protectedProcedure
    .input(
      z.object({
        bookingId: z.string(),
        note: z.string().max(5000),
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

      const updated = await bookingTransaction(ctx.prisma, async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: input.bookingId },
          select: {
            id: true,
            notes: true,
            staffNotes: true,
            assignedToId: true,
            item: { select: { responsibleMembers: { select: { id: true } } } },
          },
        })
        if (!booking) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." })
        }
        assertCanManageScopedBooking(ctx, booking)

        const noteEntry = [
          `Rental Team (${formatInBerlin(new Date(), "yyyy-MM-dd HH:mm")}):`,
          trimmedNote,
        ].join("\n")
        const updatedNotes = booking.staffNotes
          ? [booking.staffNotes, noteEntry].join("\n\n")
          : noteEntry

        return tx.booking.update({
          where: { id: input.bookingId },
          data: { staffNotes: updatedNotes },
        })
      })

      await logAction({
        type: LogType.BOOKING,
        userId: ctx.session.user.id,
        bookingId: updated.id,
        message: "notes:added",
      })

      return staffBooking(updated)
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
      const updated = await bookingTransaction(ctx.prisma, async (tx) => {
        const booking = await tx.booking.findUnique({
          where: { id: input.bookingId },
          include: {
            item: {
              select: {
                titleEn: true,
                totalQuantity: true,
                active: true,
                responsibleMembers: { select: { id: true } },
              },
            },
          },
        })
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found." })
        assertCanManageScopedBooking(ctx, booking)
        if (usesAdminBlockPrefix(booking.notes))
          await requireBlockItem(tx, ctx.session.user.id, booking.itemId)

        const now = new Date()
        if (!canTeamTransitionStatus(booking.status, input.newStatus, booking.startDate, now)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot change booking status from "${booking.status}" to "${input.newStatus}".`,
          })
        }

        if (input.newStatus === BookingStatus.ACCEPTED) {
          if (!booking.item.active)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Item is inactive." })
          await assertBookingCapacity(tx, {
            itemId: booking.itemId,
            startDate: booking.startDate,
            endDate: booking.endDate,
            quantity: booking.quantity,
            totalQuantity: booking.item.totalQuantity,
            excludeBookingId: booking.id,
          })
        }

        // Add any specific business logic for status transitions by team
        // e.g. if newStatus is BORROWED, assign self to assignedToId
        let assignedToUpdate: Prisma.BookingUpdateInput["assignedTo"] = undefined
        if (input.newStatus === BookingStatus.BORROWED && !booking.assignedToId) {
          assignedToUpdate = { connect: { id: ctx.session.user.id } }
        }

        return tx.booking.update({
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
      })

      await notifyBookingStatusChange({
        prisma: ctx.prisma,
        bookingId: updated.id,
        status: input.newStatus,
        itemTitle: updated.item.titleEn,
        startDate: updated.startDate,
        endDate: updated.endDate,
        notes: customerNotes(updated.notes),
        recipients: filterRecipients([
          { id: updated.userId, email: updated.user.email, name: updated.user.name },
          updated.assignedTo
            ? {
                id: updated.assignedTo.id,
                email: updated.assignedTo.email,
                name: updated.assignedTo.name,
              }
            : null,
        ]),
        performedBy: {
          id: ctx.session.user.id,
          name: ctx.session.user.name ?? null,
          email: ctx.session.user.email ?? null,
        },
      })
      await logAction({
        type: LogType.BOOKING,
        userId: ctx.session.user.id,
        bookingId: updated.id,
        message: `status:${input.newStatus}`,
      })
      return staffBooking(updated)
    }),

  blockableItems: protectedProcedure.query(async ({ ctx }) => {
    const role = await requireBlockStaff(ctx.prisma, ctx.session.user.id)
    return ctx.prisma.item.findMany({
      where: {
        active: true,
        ...(role === "ADMIN" ? {} : { responsibleMembers: { some: { id: ctx.session.user.id } } }),
      },
      select: { id: true, titleEn: true, titleDe: true, totalQuantity: true },
      orderBy: { titleEn: "asc" },
    })
  }),

  blockSlots: protectedProcedure
    .input(
      z.object({
        itemId: z.string().min(1).max(200),
        start: z.string().datetime(),
        end: z.string().datetime(),
        quantity: z.number().int().min(1).optional(),
        reason: z.string().max(500).optional(),
        recurrence: z
          .object({
            frequency: z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]).default("NONE"),
            until: z.string().datetime().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const startDate = parseISO(input.start)
      const endDate = parseISO(input.end)
      const frequency = input.recurrence?.frequency ?? "NONE"
      const until = input.recurrence?.until ? parseISO(input.recurrence.until) : null
      const spec = {
        startDate,
        endDate,
        frequency,
        timeZone: BLOCK_TIME_ZONE,
        until,
        stoppedFrom: null,
        quantity: input.quantity ?? 1,
        exceptions: [],
      }
      try {
        validateBlockRecurrence(spec)
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Invalid block dates or recurrence. Use a positive duration within the recurrence period.",
        })
      }

      const result = await bookingTransaction(ctx.prisma, async (tx) => {
        const item = await requireBlockItem(tx, ctx.session.user.id, input.itemId)
        if (!item.active) throw new TRPCError({ code: "BAD_REQUEST", message: "Item is inactive." })
        if (
          !(await consumeBudget("block-create-global", "all", 500, 86400000, tx)) ||
          !(await consumeBudget("block-create-user", ctx.session.user.id, 100, 86400000, tx))
        ) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Block creation limit reached. Try again later.",
          })
        }
        const quantity = input.quantity ?? item.totalQuantity
        if (quantity > item.totalQuantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Block quantity cannot exceed available quantity.",
          })
        }

        const now = new Date()
        const activeRules = await tx.recurringBlock.count({
          where: {
            itemId: input.itemId,
            AND: [
              { OR: [{ frequency: { not: "NONE" } }, { endDate: { gt: now } }] },
              {
                OR: [{ until: null }, { until: { gte: new Date(now.getTime() - 32 * 86400000) } }],
              },
              { OR: [{ stoppedFrom: null }, { stoppedFrom: { gt: now } }] },
            ],
          },
        })
        if (activeRules >= MAX_BLOCK_RULES_PER_ITEM)
          throw new TRPCError({
            code: "CONFLICT",
            message: "This item has too many active block rules. Stop an existing series first.",
          })
        await assertBlockPreservesBookings(tx, input.itemId, item.totalQuantity, {
          ...spec,
          quantity,
        })
        const block = await tx.recurringBlock.create({
          data: {
            itemId: input.itemId,
            createdById: ctx.session.user.id,
            startDate,
            endDate,
            frequency,
            timeZone: BLOCK_TIME_ZONE,
            until,
            quantity,
            reason: input.reason?.trim() || null,
          },
        })
        return {
          id: block.id,
          title: item.titleEn,
          frequency,
          until,
          indefinite: frequency !== "NONE" && !until,
        }
      })
      await logAction({
        type: LogType.BOOKING,
        userId: ctx.session.user.id,
        message: `blocked:create:${result.id}`,
      })
      return result
    }),

  cancelBlockOccurrence: protectedProcedure
    .input(
      z.object({
        recurringBlockId: z.string().min(1).max(200),
        occurrenceStart: z.string().datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await bookingTransaction(ctx.prisma, async (tx) => {
        const block = await tx.recurringBlock.findUnique({ where: { id: input.recurringBlockId } })
        if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "Block not found." })
        await requireBlockItem(tx, ctx.session.user.id, block.itemId)
        const occurrenceStart = parseISO(input.occurrenceStart)
        if (!isBlockOccurrence(block, occurrenceStart))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This occurrence is no longer active.",
          })
        await tx.recurringBlockException.upsert({
          where: { blockId_occurrenceStart: { blockId: block.id, occurrenceStart } },
          create: { blockId: block.id, occurrenceStart },
          update: {},
        })
      })
      await logAction({
        type: LogType.BOOKING,
        userId: ctx.session.user.id,
        message: `blocked:cancel:${input.recurringBlockId}:${input.occurrenceStart}`,
      })
      return { success: true }
    }),

  stopBlockSeries: protectedProcedure
    .input(
      z.object({
        recurringBlockId: z.string().min(1).max(200),
        occurrenceStart: z.string().datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await bookingTransaction(ctx.prisma, async (tx) => {
        const block = await tx.recurringBlock.findUnique({ where: { id: input.recurringBlockId } })
        if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "Block not found." })
        await requireBlockItem(tx, ctx.session.user.id, block.itemId)
        const occurrenceStart = parseISO(input.occurrenceStart)
        if (!isBlockOccurrence(block, occurrenceStart))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This occurrence is no longer active.",
          })
        const stoppedFrom =
          block.stoppedFrom && block.stoppedFrom < occurrenceStart
            ? block.stoppedFrom
            : occurrenceStart
        await tx.recurringBlock.update({ where: { id: block.id }, data: { stoppedFrom } })
      })
      await logAction({
        type: LogType.BOOKING,
        userId: ctx.session.user.id,
        message: `blocked:stop:${input.recurringBlockId}:${input.occurrenceStart}`,
      })
      return { success: true }
    }),

  listForRentalCalendar: protectedProcedure
    .input(
      z.object({
        from: z.string(),
        to: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const role = await requireBlockStaff(ctx.prisma, ctx.session.user.id)
      const from = parseISO(input.from)
      const to = parseISO(input.to)
      assertDateRange(from, to, 400)
      const scope =
        role === "ADMIN"
          ? {}
          : { item: { responsibleMembers: { some: { id: ctx.session.user.id } } } }
      const bookings = await ctx.prisma.booking.findMany({
        where: {
          ...scope,
          AND: [{ startDate: { lt: to } }, { endDate: { gt: from } }],
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
      const blocks = await blockOccurrences(ctx.prisma, from, to, scope)
      return [...bookings.map(staffBooking), ...blocks].sort(
        (a, b) => a.startDate.getTime() - b.startDate.getTime(),
      )
    }),

  getBookings: protectedProcedure
    .input(
      z.object({
        start: z.date(),
        end: z.date(),
      }),
    )
    .query(async ({ input, ctx }) => {
      assertDateRange(input.start, input.end, 400)
      const role = isRentalTeamMember(ctx)
        ? await requireBlockStaff(ctx.prisma, ctx.session.user.id)
        : ctx.session.user.role

      if (role === "ADMIN" || role === "RENTAL") {
        await markUpcomingBookingsBorrowed()
      }

      const where: Prisma.BookingWhereInput = {
        AND: [{ startDate: { lt: input.end } }, { endDate: { gt: input.start } }],
      }

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
      const blocks =
        role === "ADMIN" || role === "RENTAL"
          ? await blockOccurrences(
              ctx.prisma,
              input.start,
              input.end,
              role === "ADMIN"
                ? {}
                : { item: { responsibleMembers: { some: { id: ctx.session.user.id } } } },
            )
          : []
      return [
        ...bookings.map(isRentalTeamMember(ctx) ? staffBooking : ownerBooking),
        ...blocks,
      ].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
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
      assertDateRange(queryStartBoundary, queryEndBoundary, 62)
      const now = Date.now()
      if (
        queryStartBoundary.getTime() < now - 7 * 86400000 ||
        queryEndBoundary.getTime() > now + 400 * 86400000
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Availability is limited to the current booking window.",
        })
      }
      const bookings = await ctx.prisma.booking.findMany({
        where: {
          itemId: input.itemId,
          status: {
            in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED],
          },
          AND: [{ startDate: { lt: queryEndBoundary } }, { endDate: { gt: queryStartBoundary } }],
        },
        select: { id: true, startDate: true, endDate: true, status: true, quantity: true },
        take: 1001,
        orderBy: { startDate: "asc" },
      })
      if (bookings.length > 1000)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select a smaller date range." })
      const blocks = await blockOccurrences(ctx.prisma, queryStartBoundary, queryEndBoundary, {
        itemId: input.itemId,
      })
      return [
        ...bookings,
        ...blocks.map(({ id, startDate, endDate, status, quantity }) => ({
          id,
          startDate,
          endDate,
          status,
          quantity,
        })),
      ].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
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
