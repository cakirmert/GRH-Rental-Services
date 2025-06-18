import { describe, it, expect } from "vitest"
import { vi } from "vitest"
import { BookingStatus } from "@prisma/client"
import type { Context } from "@/server/context"
import type { Request } from "express"

const prisma = {
  booking: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  notification: { create: vi.fn() },
  log: { create: vi.fn() },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))

async function createCaller() {
  const { bookingsRouter } = await import("../bookings")
  const booking = {
    id: "b1",
    userId: "user1",
    assignedToId: null,
    notes: null,
    item: { titleEn: "Item" },
  }
  prisma.booking.findUnique.mockResolvedValue(booking)
  prisma.booking.update.mockResolvedValue(booking)
  const ctx: Context = {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id: "admin1", role: "ADMIN", email: "admin@example.com" },
      expires: "2024-12-31T23:59:59.000Z",
    },
    req: new Request("http://localhost:3000/test"),
  }
  const caller = bookingsRouter.createCaller(ctx)
  return { caller, prisma }
}
describe("notifications on status update", () => {
  it("creates notification when user updates own booking", async () => {
    const { caller, prisma } = await createCaller()
    await caller.updateBookingStatusByTeam({ bookingId: "b1", newStatus: BookingStatus.ACCEPTED })
    expect(prisma.notification.create).toHaveBeenCalled()
  })
})
