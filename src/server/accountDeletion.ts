import type { Prisma } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { digest } from "@/lib/auth/state"

/** Item responsibility and unfinished assignments must be handed over explicitly. */
export async function assertAccountHandover(tx: Prisma.TransactionClient, userId: string) {
  const item = await tx.item.findFirst({
    where: { responsibleMembers: { some: { id: userId } } },
    select: { id: true },
  })
  const assigned = await tx.booking.findFirst({
    where: { assignedToId: userId, status: { in: ["REQUESTED", "ACCEPTED", "BORROWED"] } },
    select: { id: true },
  })
  if (item || assigned) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Transfer item responsibilities and unfinished booking assignments before deleting this account or stepping down.",
    })
  }
}

/**
 * Call only after eligibility checks, inside the same serializable transaction.
 * Foreign keys remove linked chats, receipts, notifications, sessions, push data,
 * proposals/votes and all credentials (including revoked credential tombstones).
 */
export async function deleteAccountData(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string },
) {
  const bookings = await tx.booking.findMany({ where: { userId: user.id }, select: { id: true } })
  // Legacy notifications can contain a sender name/message excerpt without an
  // actor foreign key. Clear those unattributed alerts before cascading the
  // sender's messages; identified alerts from other people remain.
  const conversations = await tx.bookingChatMessage.findMany({
    where: { senderId: user.id },
    distinct: ["threadId"],
    select: { thread: { select: { bookingId: true } } },
  })
  await tx.notification.deleteMany({
    where: {
      actorId: null,
      bookingId: { in: conversations.map((message) => message.thread.bookingId) },
    },
  })
  const logs = await tx.log.deleteMany({
    where: {
      OR: [
        { userId: user.id },
        { bookingId: { in: bookings.map((booking) => booking.id) } },
        {
          message: {
            in: ["promoted", "added", "demoted", "promotedToAdmin", "demotedFromAdmin"].map(
              (action) => `${action}:${user.id}`,
            ),
          },
        },
      ],
    },
  })
  const email = user.email.trim().toLowerCase()
  const tokens = await tx.verificationToken.deleteMany({
    where: { identifier: { equals: email, mode: "insensitive" } },
  })
  const state = await tx.authState.deleteMany({
    where: {
      OR: [{ value: { path: ["userId"], equals: user.id } }, { key: `otp:${digest(email)}` }],
    },
  })
  // Preserve unlinked aggregate ratings, but not the person's free-text response.
  await tx.releaseFeedback.updateMany({ where: { userId: user.id }, data: { message: "" } })
  const deletedBookings = await tx.booking.deleteMany({ where: { userId: user.id } })
  await tx.user.delete({ where: { id: user.id } })
  return {
    bookingsDeleted: deletedBookings.count,
    logsDeleted: logs.count,
    verificationTokensDeleted: tokens.count,
    authStatesDeleted: state.count,
  }
}
