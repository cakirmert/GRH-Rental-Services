import { router, protectedProcedure } from "@/lib/trpcServer"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@prisma/client"
import { notificationEmitter } from "@/lib/notifications"
import { sendChatMessageEmail } from "@/server/email/sendChatMessageEmail"

export const chatRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        bookingId: z.string(),
        cursor: z.string().nullish(),
        limit: z.number().int().min(1).max(50).default(30),
      }),
    )
    .query(async ({ input, ctx }) => {
      await assertCanAccessBooking(ctx, input.bookingId)

      // create thread lazily
      const thread = await ctx.prisma.bookingChatThread.upsert({
        where: { bookingId: input.bookingId },
        update: {},
        create: { bookingId: input.bookingId },
      })

      const msgs = await ctx.prisma.bookingChatMessage.findMany({
        where: { threadId: thread.id },
        include: {
          sender: { select: { id: true, name: true, role: true } },
          reads: { where: { userId: ctx.session.user.id }, select: { userId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      })

      let nextCursor: string | undefined = undefined
      if (msgs.length > input.limit) {
        nextCursor = msgs.pop()!.id
      }
      return { messages: msgs.reverse(), nextCursor }
    }),

  send: protectedProcedure
    .input(z.object({ bookingId: z.string(), body: z.string().min(1).max(10_000) }))
    .mutation(async ({ input, ctx }) => {
      const message = await ctx.prisma.$transaction(
        async (tx) => {
          // Serialize all senders for this booking before checking either send limit.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`chat-send:${input.bookingId}`}, 0))`
          await assertCanAccessBooking(ctx, input.bookingId, tx)
          const now = new Date()
          const booking = await tx.booking.findUnique({
            where: { id: input.bookingId },
            select: {
              endDate: true,
              chatThread: { select: { id: true, closedAt: true } },
            },
          })
          if (!booking) throw new TRPCError({ code: "NOT_FOUND" })

          const thread =
            booking.chatThread ??
            (await tx.bookingChatThread.upsert({
              where: { bookingId: input.bookingId },
              update: {},
              create: { bookingId: input.bookingId },
            }))

          if (thread.closedAt && thread.closedAt <= now) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Chat is closed." })
          }

          const graceEnd = new Date(booking.endDate.getTime() + 7 * 24 * 60 * 60 * 1000)
          if (now > graceEnd) {
            await tx.bookingChatThread.update({
              where: { id: thread.id },
              data: { closedAt: graceEnd },
            })
            return null
          }

          const last = await tx.bookingChatMessage.findFirst({
            where: { threadId: thread.id, senderId: ctx.session.user.id },
            orderBy: { createdAt: "desc" },
          })
          const recent = await tx.bookingChatMessage.findMany({
            where: { threadId: thread.id },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { senderId: true },
          })
          // Record the same post-lock instant used for the one-second check.
          const sentAt = new Date()
          if (last && sentAt.getTime() - last.createdAt.getTime() < 1000) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "Too many messages. Please slow down.",
            })
          }
          if (recent.length === 10 && recent.every((m) => m.senderId === ctx.session.user.id)) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Please wait for a response." })
          }
          return tx.bookingChatMessage.create({
            data: {
              thread: { connect: { id: thread.id } },
              sender: { connect: { id: ctx.session.user.id } },
              body: input.body.trim(),
              createdAt: sentAt,
            },
            include: {
              sender: { select: { id: true, name: true, role: true } },
              reads: { where: { userId: ctx.session.user.id }, select: { userId: true } },
            },
          })
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5000,
          timeout: 10000,
        },
      )

      if (!message) throw new TRPCError({ code: "FORBIDDEN", message: "Chat is closed." })
      await createMessageNotifications(ctx, message)
      return message
    }),

  markRead: protectedProcedure
    .input(z.object({ messageIds: z.string().array().min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      const messageIds = Array.from(new Set(input.messageIds))
      const messages = await ctx.prisma.bookingChatMessage.findMany({
        where: { id: { in: messageIds } },
        select: {
          id: true,
          thread: { select: { bookingId: true } },
        },
      })

      if (messages.length !== messageIds.length) {
        throw new TRPCError({ code: "NOT_FOUND" })
      }

      const bookingIds = Array.from(new Set(messages.map((message) => message.thread.bookingId)))
      await Promise.all(bookingIds.map((bookingId) => assertCanAccessBooking(ctx, bookingId)))

      await Promise.all(
        messageIds.map((messageId) =>
          ctx.prisma.bookingChatRead.upsert({
            where: { userId_messageId: { userId: ctx.session.user.id, messageId } },
            update: {},
            create: { userId: ctx.session.user.id, messageId },
          }),
        ),
      )
      return { ok: true }
    }),
})

/// --------------------------------------------------
/// helpers (drop into same file or utils)
import type { Context } from "@/server/context"

type NotificationCreateData = Parameters<Context["prisma"]["notification"]["create"]>[0]["data"]

async function createNotifications(ctx: Context, data: NotificationCreateData[]) {
  const notificationDelegate = ctx.prisma.notification as Context["prisma"]["notification"] & {
    createManyAndReturn?: (args: {
      data: NotificationCreateData[]
    }) => Promise<Array<Awaited<ReturnType<Context["prisma"]["notification"]["create"]>>>>
  }

  if (typeof notificationDelegate.createManyAndReturn === "function") {
    return notificationDelegate.createManyAndReturn({ data })
  }

  return Promise.all(data.map((entry) => notificationDelegate.create({ data: entry })))
}

async function assertCanAccessBooking(
  ctx: Context,
  bookingId: string,
  db: Pick<Prisma.TransactionClient, "booking"> = ctx.prisma,
) {
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      userId: true,
      assignedToId: true,
      item: { select: { responsibleMembers: { select: { id: true } } } },
    },
  })
  if (!b) throw new TRPCError({ code: "NOT_FOUND" })
  const me = ctx.session?.user
  const admin = me?.role === "ADMIN"
  const scopedRental =
    me?.role === "RENTAL" &&
    (b.assignedToId === me.id || b.item?.responsibleMembers?.some((member) => member.id === me.id))
  const allowed = admin || scopedRental || b.userId === me?.id
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN" })
}

async function createMessageNotifications(
  ctx: Context,
  msg: {
    threadId: string
    senderId: string
    body: string
    sender: { name: string | null; role: string }
  },
) {
  const { threadId, senderId, body, sender } = msg
  const thread = await ctx.prisma.bookingChatThread.findUnique({
    where: { id: threadId },
    select: {
      booking: {
        select: {
          id: true,
          userId: true,
          assignedToId: true,
          item: { select: { titleEn: true } },
          user: { select: { id: true, email: true, name: true } },
          assignedTo: { select: { id: true, email: true, name: true, role: true } },
        },
      },
    },
  })
  if (!thread) return

  const staffAssignee =
    thread.booking.assignedTo && ["ADMIN", "RENTAL"].includes(thread.booking.assignedTo.role)
      ? thread.booking.assignedTo
      : null
  const recips = [thread.booking.userId, staffAssignee?.id].filter(
    (id) => id && id !== senderId,
  ) as string[]
  if (!recips.length) return

  const senderName = sender.name || "Someone"
  const itemTitle = thread.booking.item.titleEn ?? "Booking"

  const notifications = await createNotifications(
    ctx,
    recips.map((id) => ({
      userId: id,
      actorId: senderId,
      bookingId: thread.booking.id,
      type: "BOOKING_RESPONSE",
      message: JSON.stringify({
        key: "notifications.newChatMessage",
        vars: {
          item: itemTitle,
          sender: senderName,
          message: body.length > 100 ? body.substring(0, 100) + "..." : body,
        },
      }),
    })),
  )
  for (const n of notifications) {
    notificationEmitter.emit("new", n)
  }

  // Send email notifications to recipients
  const recipientUsers = [thread.booking.user, staffAssignee].filter(
    (u) => u && u.id !== senderId,
  ) as { id: string; email: string; name: string | null }[]

  for (const recipient of recipientUsers) {
    sendChatMessageEmail({
      to: { email: recipient.email, name: recipient.name },
      senderName,
      itemTitle,
      messagePreview: body,
      bookingId: thread.booking.id,
    }).catch(() => {})
  }
}
