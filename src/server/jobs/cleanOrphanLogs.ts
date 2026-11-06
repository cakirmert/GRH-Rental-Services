import prisma from "@/lib/prismadb"
import { bookingTransaction } from "@/server/bookingSecurity"
import type { PrismaClient } from "@prisma/client"

/** Logs predate foreign keys. Remove only rows whose referenced parent is gone. */
export async function cleanOrphanLogs(db: PrismaClient = prisma) {
  return bookingTransaction(db, async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT l."id" FROM "Log" l
      WHERE (l."userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = l."userId"))
         OR (l."bookingId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b."id" = l."bookingId"))
      ORDER BY l."id" LIMIT 1000`
    const result = await tx.log.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } })
    return { deleted: result.count, batchFull: rows.length === 1000 }
  })
}
