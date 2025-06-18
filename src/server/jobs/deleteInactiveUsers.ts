import cron from "node-cron"
import prisma from "@/lib/prismadb"

export async function deleteInactiveUsers() {
  const threshold = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  const users = await prisma.user.findMany({
    where: {
      lastLoginAt: { lt: threshold },
    },
    select: { id: true },
  })

  for (const { id } of users) {
    await prisma.booking.deleteMany({ where: { userId: id } })
    await prisma.user.delete({ where: { id } })
  }
}

cron.schedule("30 3 * * *", deleteInactiveUsers)

// Run once on startup
deleteInactiveUsers().catch((err) => console.error(err))
