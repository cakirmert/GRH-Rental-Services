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
