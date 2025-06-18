import cron from "node-cron"
import prisma from "@/lib/prismadb"

export async function deleteOldBookings() {
  const threshold = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
  await prisma.booking.deleteMany({
    where: {
      endDate: { lt: threshold },
    },
  })
}

cron.schedule("0 3 * * *", deleteOldBookings)

// Run once on startup
deleteOldBookings().catch((err) => console.error(err))
