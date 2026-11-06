import type { Prisma, PrismaClient } from "@prisma/client"

const DAY = 24 * 60 * 60 * 1000
type Database = Prisma.TransactionClient | PrismaClient

/** A rolling session can stay in use without another credential sign-in.
 * Record that use at most daily; the conditional update prevents stale requests
 * from moving the activity timestamp backwards. No identifiers enter logs. */
export async function recordAccountActivity(
  db: Database,
  userId: string,
  lastActiveAt: Date,
  now = new Date(),
) {
  const threshold = new Date(now.getTime() - DAY)
  if (lastActiveAt > threshold) return
  await db.user.updateMany({
    where: { id: userId, lastActiveAt: { lte: threshold } },
    data: { lastActiveAt: now },
  })
}
