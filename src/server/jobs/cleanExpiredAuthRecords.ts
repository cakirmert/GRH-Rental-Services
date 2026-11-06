import prisma from "@/lib/prismadb"
import type { PrismaClient } from "@prisma/client"

/** Expired records already grant no access; cap each batch and recheck expiry when deleting. */
export async function cleanExpiredAuthRecords(
  db: Pick<PrismaClient, "session" | "verificationToken"> = prisma,
) {
  const now = new Date()
  const sessions = await db.session.findMany({
    where: { expires: { lte: now } },
    select: { id: true },
    orderBy: { expires: "asc" },
    take: 1000,
  })
  const expiredSessions = await db.session.deleteMany({
    where: { id: { in: sessions.map((session) => session.id) }, expires: { lte: now } },
  })
  const tokens = await db.verificationToken.findMany({
    where: { expires: { lte: now } },
    select: { identifier: true, token: true },
    orderBy: { expires: "asc" },
    take: 1000,
  })
  const expiredTokens = await db.verificationToken.deleteMany({
    where: { OR: tokens, expires: { lte: now } },
  })
  return { sessionsDeleted: expiredSessions.count, verificationTokensDeleted: expiredTokens.count }
}
