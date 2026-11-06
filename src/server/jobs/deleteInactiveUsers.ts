import prisma from "@/lib/prismadb"
import { bookingTransaction } from "@/server/bookingSecurity"
import type { Prisma } from "@prisma/client"
import { deleteAccountData } from "@/server/accountDeletion"
import { accountInactivityThreshold } from "@/server/retentionPolicy"
import { TRPCError } from "@trpc/server"

export async function deleteInactiveUsers() {
  const now = new Date()
  const threshold = accountInactivityThreshold(now)
  const operationalBooking: Prisma.BookingWhereInput = {
    OR: [{ status: { in: ["REQUESTED", "ACCEPTED", "BORROWED"] } }, { endDate: { gte: now } }],
  }
  const users = await prisma.user.findMany({
    where: {
      lastLoginAt: { lt: threshold },
      lastActiveAt: { lt: threshold },
      role: "USER",
      isSuperAdmin: false,
      bookings: { none: operationalBooking },
      assignedBookings: { none: operationalBooking },
      responsibleItems: { none: {} },
    },
    select: { id: true },
    take: 100,
    orderBy: { id: "asc" },
  })

  let deleted = 0
  for (const user of users) {
    try {
      const removed = await bookingTransaction(prisma, async (tx) => {
        const eligible = await tx.user.findFirst({
          where: {
            id: user.id,
            lastLoginAt: { lt: threshold },
            lastActiveAt: { lt: threshold },
            role: "USER",
            isSuperAdmin: false,
            responsibleItems: { none: {} },
          },
          select: { id: true, email: true },
        })
        if (!eligible) return
        const protectedBooking = await tx.booking.findFirst({
          where: {
            AND: [{ OR: [{ userId: user.id }, { assignedToId: user.id }] }, operationalBooking],
          },
          select: { id: true },
        })
        if (protectedBooking) return
        await deleteAccountData(tx, eligible)
        return true
      })
      if (removed) deleted++
    } catch (error) {
      // Another request may sign in, change role, or book while cleanup runs.
      // Leave that account intact and continue; never retry a stale decision.
      if (!(error instanceof TRPCError) || error.code !== "CONFLICT") throw error
    }
  }
  return { candidates: users.length, deleted, skipped: users.length - deleted }
}
