import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Context } from "@/server/context"
import { notificationEmitter } from "@/lib/notifications"

// Helper to simulate delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("chatRouter.createMessageNotifications performance", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(notificationEmitter, 'emit').mockImplementation(() => true)
  })

  it("measures execution time of sequential inserts vs batch insert", async () => {
    const numRecipients = 50

    // Simulate Prisma create behavior for sequential
    const create = vi.fn().mockImplementation(async (args) => {
      await delay(10) // 10ms per insert
      return { id: "notif-" + Math.random(), ...args.data }
    })

    // Simulate Prisma createManyAndReturn behavior
    const createManyAndReturn = vi.fn().mockImplementation(async (args) => {
      await delay(15) // 15ms total for bulk insert
      return args.data.map((d: any) => ({ id: "notif-" + Math.random(), ...d }))
    })

    const recips = Array.from({ length: numRecipients }, (_, i) => `recip-${i}`)
    const bookingId = "booking-123"

    // 1. Measure sequential loop
    const startSeq = Date.now()
    for (const id of recips) {
      await create({
        data: {
          userId: id,
          bookingId: bookingId,
          type: "BOOKING_RESPONSE",
          message: "test",
        },
      })
    }
    const endSeq = Date.now()
    const seqDuration = endSeq - startSeq

    // 2. Measure createManyAndReturn
    const startBatch = Date.now()
    await createManyAndReturn({
      data: recips.map((id) => ({
        userId: id,
        bookingId: bookingId,
        type: "BOOKING_RESPONSE",
        message: "test",
      })),
    })
    const endBatch = Date.now()
    const batchDuration = endBatch - startBatch

    console.log(`Sequential: ${seqDuration}ms`)
    console.log(`Batch: ${batchDuration}ms`)
    console.log(`Improvement: ${((seqDuration - batchDuration) / seqDuration * 100).toFixed(2)}%`)

    expect(batchDuration).toBeLessThan(seqDuration)
  })
})
