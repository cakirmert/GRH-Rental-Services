import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const db = new PrismaClient()

async function run() {
  const numRecipients = 50

  const userIds = []
  for (let i = 0; i < numRecipients; i++) {
    const user = await db.user.create({
      data: {
        email: `test-${randomUUID()}@example.com`,
        name: `Test User ${i}`,
        role: "USER"
      }
    })
    userIds.push(user.id)
  }

  const item = await db.item.create({
    data: {
      type: "OTHER",
      titleEn: "Test Item",
      titleDe: "Test Item DE",
      active: true
    }
  })

  const booking = await db.booking.create({
    data: {
      userId: userIds[0],
      itemId: item.id,
      startDate: new Date(),
      endDate: new Date()
    }
  })

  // Benchmark loop
  const startLoop = performance.now()
  const createdNotifs = []
  for (const id of userIds) {
    const n = await db.notification.create({
      data: {
        userId: id,
        bookingId: booking.id,
        type: "BOOKING_RESPONSE",
        message: "Test message"
      }
    })
    createdNotifs.push(n)
  }
  const endLoop = performance.now()
  console.log(`Loop time: ${endLoop - startLoop}ms for ${createdNotifs.length} items`)

  await db.notification.deleteMany({ where: { bookingId: booking.id } })

  // Benchmark createManyAndReturn
  const startBulk = performance.now()
  const notifs = await db.notification.createManyAndReturn({
    data: userIds.map(id => ({
      userId: id,
      bookingId: booking.id,
      type: "BOOKING_RESPONSE",
      message: "Test message bulk"
    }))
  })
  const endBulk = performance.now()
  console.log(`Bulk time: ${endBulk - startBulk}ms for ${notifs.length} items`)

  // Cleanup
  await db.notification.deleteMany({ where: { bookingId: booking.id } })
  await db.booking.deleteMany({ where: { id: booking.id } })
  await db.item.deleteMany({ where: { id: item.id } })
  await db.user.deleteMany({ where: { id: { in: userIds } } })
}

run().catch(console.error).finally(() => db.$disconnect())
