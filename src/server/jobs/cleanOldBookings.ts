import prisma from "@/lib/prismadb"
import { bookingTransaction } from "@/server/bookingSecurity"
import type { Prisma } from "@prisma/client"

export async function deleteOldBookings() {
  const threshold = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
  const eligible: Prisma.BookingWhereInput = {
    endDate: { lt: threshold },
    status: { in: ["COMPLETED", "CANCELLED", "DECLINED"] },
  }
  return bookingTransaction(prisma, async (tx) => {
    const candidates = await tx.booking.findMany({
      where: eligible,
      select: { id: true },
      orderBy: [{ endDate: "asc" }, { id: "asc" }],
      take: 501,
    })
    const ids = candidates.slice(0, 500).map((booking) => booking.id)
    const logs = await tx.log.deleteMany({ where: { bookingId: { in: ids } } })
    const result = await tx.booking.deleteMany({ where: { ...eligible, id: { in: ids } } })
    return { deleted: result.count, logsDeleted: logs.count, hasMore: candidates.length > 500 }
  })
}
