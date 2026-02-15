import { describe, it, expect } from "vitest"
import { vi } from "vitest"
import { BookingStatus } from "@prisma/client"
import type { Context } from "@/server/context"

const prisma = {
  booking: {
    findUnique: vi
      .fn()
      .mockResolvedValue({ userId: "u1", status: BookingStatus.REQUESTED, startDate: new Date() }),
    update: vi.fn().mockResolvedValue({ id: "b1" }),
  },
  notification: { create: vi.fn() },
  log: { create: vi.fn() },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))

async function createCaller() {
  const { bookingsRouter } = await import("../bookingRouter")
  const mockBooking = {
    id: "b1",
    userId: "u1",
    status: BookingStatus.REQUESTED,
    startDate: new Date(),
    endDate: new Date(),
    item: { titleEn: "Item" },
    user: { id: "u1", email: "test@example.com", name: "Test User" },
    assignedTo: null,
    notes: null,
  }
  prisma.booking.findUnique.mockResolvedValue(mockBooking)
  prisma.booking.update.mockResolvedValue({ ...mockBooking, status: BookingStatus.CANCELLED })
  const ctx: Context = {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id: "u1", role: "USER", email: "test@example.com" },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    req: new Request("http://localhost"),
  }
  return { caller: bookingsRouter.createCaller(ctx), prisma }
}

describe("cancel log", () => {
  it("logs when cancelling", async () => {
    const { caller, prisma } = await createCaller()
    await caller.cancel({ id: "b1" })
    expect(prisma.log.create).toHaveBeenCalled()
  })
})
