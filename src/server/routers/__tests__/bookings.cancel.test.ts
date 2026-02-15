import { describe, it, expect } from "vitest"
import { vi } from "vitest"
import { BookingStatus } from "@prisma/client"
import type { Context } from "@/server/context"

const prisma = {
  booking: {
    findUnique: vi.fn().mockResolvedValue({ userId: "user1", status: BookingStatus.REQUESTED }),
    update: vi.fn(),
  },
  log: { create: vi.fn() },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))
vi.mock("@/server/jobs/autoBorrowed", () => ({ markUpcomingBookingsBorrowed: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ notificationEmitter: { emit: vi.fn() } }))

async function createCaller(status: BookingStatus) {
  const { bookingsRouter } = await import("../bookingRouter")
  prisma.booking.findUnique.mockResolvedValue({ userId: "user1", status })
  prisma.booking.update.mockResolvedValue({ id: "1" })
  const ctx: Context = {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id: "user1", role: "USER", email: "test@example.com" },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    req: new Request("http://localhost"),
  }
  return bookingsRouter.createCaller(ctx)
}

describe("cancel booking validation", () => {
  const allowed: BookingStatus[] = [BookingStatus.REQUESTED, BookingStatus.ACCEPTED]
  const disallowed = (Object.values(BookingStatus) as BookingStatus[]).filter(
    (s) => !allowed.includes(s),
  )
  it.each(disallowed)("rejects cancellation for %s status", async (status) => {
    const caller = await createCaller(status as BookingStatus)
    await expect(caller.cancel({ id: "1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `Bookings with status "${status}" cannot be cancelled.`,
    })
  })

  it.each(allowed)("allows cancellation for %s status", async (status) => {
    const caller = await createCaller(status as BookingStatus)
    await expect(caller.cancel({ id: "1" })).resolves.toBeDefined()
  })
})
