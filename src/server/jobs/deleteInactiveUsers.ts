import prisma from "@/lib/prismadb"
import { bookingTransaction } from "@/server/bookingSecurity"
import type { Prisma } from "@prisma/client"

export async function deleteInactiveUsers() {
  const now = new Date()
  const threshold = new Date(now.getTime() - 365 * 86400000)
  const operationalBooking: Prisma.BookingWhereInput = {
    OR: [{ status: { in: ["REQUESTED", "ACCEPTED", "BORROWED"] } }, { endDate: { gte: now } }],
  }
  const users = await prisma.user.findMany({
    where: {
      lastLoginAt: { lt: threshold },
      role: "USER",
      isSuperAdmin: false,
      bookings: { none: operationalBooking },
      assignedBookings: { none: operationalBooking },
    },
    select: { id: true },
    take: 100,
    orderBy: { id: "asc" },
  })

  for (const user of users) {
    await bookingTransaction(prisma, async (tx) => {
      const eligible = await tx.user.findFirst({
        where: { id: user.id, lastLoginAt: { lt: threshold }, role: "USER", isSuperAdmin: false },
        select: { id: true },
      })
      if (!eligible) return
      const protectedBooking = await tx.booking.findFirst({
        where: {
          AND: [{ OR: [{ userId: user.id }, { assignedToId: user.id }] }, operationalBooking],
        },
        select: { id: true },
      })
      if (protectedBooking) return
      await tx.booking.deleteMany({
        where: {
          userId: user.id,
          status: { in: ["COMPLETED", "CANCELLED", "DECLINED"] },
          endDate: { lt: now },
        },
      })
      await tx.user.delete({ where: { id: user.id } })
    })
  }
}
