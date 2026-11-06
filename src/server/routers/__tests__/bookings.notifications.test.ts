import { describe, it, expect, beforeEach } from "vitest"
import { vi } from "vitest"
import { BookingStatus } from "@prisma/client"
import type { Context } from "@/server/context"
import type { Request } from "express"

const notifyMock = vi.fn()

vi.mock("@/server/notifications/bookingStatusNotifier", () => ({
  notifyBookingStatusChange: notifyMock,
}))

const prisma = {
  $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma)),
  booking: {
    findMany: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  notification: { create: vi.fn() },
  recurringBlock: { findMany: vi.fn().mockResolvedValue([]) },
  log: { create: vi.fn() },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))

beforeEach(() => {
  vi.clearAllMocks()
})

async function createCaller() {
  const { bookingsRouter } = await import("../bookingRouter")
  const booking = {
    id: "b1",
    userId: "user1",
    assignedToId: null,
    notes: "",
    status: BookingStatus.REQUESTED,
    startDate: new Date("2024-01-01T10:00:00Z"),
    endDate: new Date("2024-01-01T12:00:00Z"),
    item: { titleEn: "Item", active: true, totalQuantity: 1 },
    quantity: 1,
    user: { id: "user1", email: "user@example.com", name: "User" },
    assignedTo: null,
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
  return { caller }
}

describe("notifications on status update", () => {
  it("triggers booking status notifier", async () => {
    const { caller } = await createCaller()
    await caller.updateBookingStatusByTeam({ bookingId: "b1", newStatus: BookingStatus.ACCEPTED })
    expect(notifyMock).toHaveBeenCalled()
    const callArgs = notifyMock.mock.calls[0][0]
    expect(callArgs.performedBy).toEqual({ id: "admin1", name: null, email: "admin@example.com" })
  })
})
