import prisma from "@/lib/prismadb"

export async function deleteOldBookings() {
  const threshold = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
  await prisma.booking.deleteMany({
    where: {
      endDate: { lt: threshold },
    },
  })
}
