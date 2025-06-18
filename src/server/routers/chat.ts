import { router, protectedProcedure } from "@/server/trpcServer"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { notificationEmitter } from "@/lib/notifications"

export const chatRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        bookingId: z.string(),
        cursor: z.string().nullish(),
        limit: z.number().max(50).default(30),
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
      await assertCanAccessBooking(ctx, input.bookingId)

      const now = new Date()

      const booking = await ctx.prisma.booking.findUnique({
        where: { id: input.bookingId },
        select: {
          endDate: true,
          chatThread: { select: { id: true, closedAt: true } },
        },
      })
      if (!booking) throw new TRPCError({ code: "NOT_FOUND" })

      let thread = booking.chatThread
      if (!thread) {
        thread = await ctx.prisma.bookingChatThread.create({
          data: { bookingId: input.bookingId },
        })
      }

      if (thread.closedAt && thread.closedAt <= now) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Chat is closed." })
      }

      const graceEnd = new Date(booking.endDate.getTime() + 7 * 24 * 60 * 60 * 1000)
      if (now > graceEnd) {
        await ctx.prisma.bookingChatThread.update({
          where: { id: thread.id },
          data: { closedAt: graceEnd },
        })
        throw new TRPCError({ code: "FORBIDDEN", message: "Chat is closed." })
      }

      const last = await ctx.prisma.bookingChatMessage.findFirst({
        where: { threadId: thread.id, senderId: ctx.session.user.id },
        orderBy: { createdAt: "desc" },
      })
      if (last && now.getTime() - last.createdAt.getTime() < 1000) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many messages. Please slow down.",
        })
      }

      const recent = await ctx.prisma.bookingChatMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { senderId: true },
      })
      if (recent.length === 10 && recent.every((m) => m.senderId === ctx.session.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Please wait for a response." })
      }
      const message = await ctx.prisma.bookingChatMessage.create({
        data: {
          thread: { connect: { id: thread.id } },
          sender: { connect: { id: ctx.session.user.id } },
          body: input.body.trim(),
        },
        include: {
          sender: { select: { id: true, name: true, role: true } },
          reads: { where: { userId: ctx.session.user.id }, select: { userId: true } },
        },
      })

      await createMessageNotifications(ctx, message)
      return message
    }),

  markRead: protectedProcedure
    .input(z.object({ messageIds: z.string().array().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await Promise.all(
        input.messageIds.map((messageId) =>
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

async function assertCanAccessBooking(ctx: Context, bookingId: string) {
  const b = await ctx.prisma.booking.findUnique({
    where: { id: bookingId },
    select: { userId: true, assignedToId: true },
  })
  if (!b) throw new TRPCError({ code: "NOT_FOUND" })
  const me = ctx.session?.user
  const rental = me?.role === "RENTAL" || me?.role === "ADMIN"
  const allowed = rental || b.userId === me?.id || b.assignedToId === me?.id
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
        select: { id: true, userId: true, assignedToId: true, item: { select: { titleEn: true } } },
      },
    },
  })
  if (!thread) return

  const recips = [thread.booking.userId, thread.booking.assignedToId].filter(
    (id) => id && id !== senderId,
  ) as string[]
  if (!recips.length) return

  const senderName = sender.name || "Someone"

  for (const id of recips) {
    const n = await ctx.prisma.notification.create({
      data: {
        userId: id,
        bookingId: thread.booking.id,
        type: "BOOKING_RESPONSE",
        message: JSON.stringify({
          key: "notifications.newChatMessage",
          vars: {
            item: thread.booking.item.titleEn,
            sender: senderName,
            message: body.length > 100 ? body.substring(0, 100) + "..." : body,
          },
        }),
      },
    })
    notificationEmitter.emit("new", n)
  }
}
