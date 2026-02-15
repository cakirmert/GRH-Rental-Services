import { describe, it, expect, vi } from "vitest"
import type { Context } from "@/server/context"

// Mock Prisma
const prisma = {
  booking: {
    findUnique: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: "new-booking", status: "REQUESTED" }),
    update: vi.fn().mockResolvedValue({ id: "booking1" }),
    aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
  },
  item: {
    findUnique: vi.fn().mockResolvedValue({
      id: "item1",
      totalQuantity: 10,
      responsibleMembers: [],
    }),
  },
  log: { create: vi.fn() },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))
vi.mock("@/server/notifications/bookingStatusNotifier", () => ({ notifyBookingStatusChange: vi.fn() }))
vi.mock("@/server/email/sendBookingRequestEmail", () => ({ sendBookingRequestEmail: vi.fn() }))

async function createCaller() {
  const { bookingsRouter } = await import("../bookings")
  const ctx: Context = {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id: "user1", role: "USER", email: "test@example.com", name: "Test User" },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    req: new Request("http://localhost"),
  }
  return bookingsRouter.createCaller(ctx)
}

describe("booking notes validation", () => {
  const longNote = "a".repeat(1001)

  it("should fail creating a booking with too long notes", async () => {
    const caller = await createCaller()
    // Use future dates to avoid "past date" error
    const futureStart = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2) // 2 days in future
    const futureEnd = new Date(futureStart.getTime() + 1000 * 60 * 60 * 24) // 1 day duration

    const input = {
      itemId: "item1",
      start: futureStart.toISOString(),
      end: futureEnd.toISOString(),
      notes: longNote,
      quantity: 1,
    }

    // This should reject if validation is working
    await expect(caller.create(input)).rejects.toThrow()
  })

  it("should fail updating a booking with too long notes", async () => {
    const caller = await createCaller()
    prisma.booking.findUnique.mockResolvedValue({ userId: "user1", status: "REQUESTED" })

    // Use future dates to avoid "past date" error
    const futureStart = new Date(Date.now() + 1000 * 60 * 60 * 24 * 2) // 2 days in future
    const futureEnd = new Date(futureStart.getTime() + 1000 * 60 * 60 * 24) // 1 day duration

    const input = {
      id: "booking1",
      start: futureStart.toISOString(),
      end: futureEnd.toISOString(),
      notes: longNote,
    }

    // This should reject if validation is working
    await expect(caller.update(input)).rejects.toThrow()
  })
})
