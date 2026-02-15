import prisma from "@/lib/prismadb"

export async function deleteInactiveUsers() {
  const threshold = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  const users = await prisma.user.findMany({
    where: {
      lastLoginAt: { lt: threshold },
    },
    select: { id: true },
  })

  const userIds = users.map((u) => u.id)

  if (userIds.length === 0) {
    return
  }

  await prisma.booking.deleteMany({
    where: { userId: { in: userIds } },
  })

  await prisma.user.deleteMany({
    where: { id: { in: userIds } },
  })
}
