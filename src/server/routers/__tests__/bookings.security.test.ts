import { beforeEach, describe, expect, it, vi } from "vitest"
import { BookingStatus } from "@prisma/client"
import type { Context } from "@/server/context"

vi.mock("@/server/jobs/autoBorrowed", () => ({
  markUpcomingBookingsBorrowed: vi.fn(),
}))

vi.mock("@/server/notifications/bookingStatusNotifier", () => ({
  notifyBookingStatusChange: vi.fn(),
}))

const prisma = {
  booking: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    aggregate: vi.fn(),
  },
  item: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  notification: {
    create: vi.fn(),
  },
  log: {
    create: vi.fn(),
  },
}

vi.mock("@/lib/prismadb", () => ({ __esModule: true, default: prisma }))

function context(role: "ADMIN" | "RENTAL" | "USER", id = "rental-1"): Context {
  return {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id, role, email: `${id}@example.com` },
      expires: "2026-12-31T23:59:59.000Z",
    },
    req: new Request("http://localhost"),
  }
}

async function callerFor(role: "ADMIN" | "RENTAL" | "USER", id = "rental-1") {
  const { bookingsRouter } = await import("../bookingRouter")
  return bookingsRouter.createCaller(context(role, id))
}

function bookingFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    userId: "resident-1",
    assignedToId: null,
    status: BookingStatus.REQUESTED,
    startDate: new Date(Date.now() + 60 * 60 * 1000),
    endDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
    notes: null,
    item: {
      titleEn: "Projector",
      responsibleMembers: [{ id: "other-rental" }],
    },
    user: { id: "resident-1", email: "resident@example.com", name: "Resident" },
    assignedTo: null,
    ...overrides,
  }
}

describe("booking router security boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prisma.booking.findMany.mockResolvedValue([])
  })

  it("filters all-booking list requests for rental users to their scoped bookings", async () => {
    const caller = await callerFor("RENTAL")

    await caller.list({ all: true })

    expect(prisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { assignedToId: "rental-1" },
            { item: { responsibleMembers: { some: { id: "rental-1" } } } },
          ],
        },
      }),
    )
  })

  it("does not let a rental user cancel an unrelated booking", async () => {
    const caller = await callerFor("RENTAL")
    prisma.booking.findUnique.mockResolvedValue(bookingFixture())

    await expect(caller.cancel({ id: "booking-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(prisma.booking.update).not.toHaveBeenCalled()
  })

  it("lets a responsible rental user cancel a scoped booking", async () => {
    const caller = await callerFor("RENTAL")
    const booking = bookingFixture({
      item: { titleEn: "Projector", responsibleMembers: [{ id: "rental-1" }] },
    })
    prisma.booking.findUnique.mockResolvedValue(booking)
    prisma.booking.update.mockResolvedValue({ ...booking, status: BookingStatus.CANCELLED })

    await expect(caller.cancel({ id: "booking-1" })).resolves.toMatchObject({
      status: BookingStatus.CANCELLED,
    })
  })

  it("does not let a rental user append notes to an unrelated booking", async () => {
    const caller = await callerFor("RENTAL")
    prisma.booking.findUnique.mockResolvedValue(
      bookingFixture({
        item: { responsibleMembers: [{ id: "other-rental" }] },
      }),
    )

    await expect(
      caller.addRentalNote({ bookingId: "booking-1", note: "Bring an adapter." }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(prisma.booking.update).not.toHaveBeenCalled()
  })

  it("does not let a rental user change status for an unrelated booking", async () => {
    const caller = await callerFor("RENTAL")
    prisma.booking.findUnique.mockResolvedValue(bookingFixture())

    await expect(
      caller.updateBookingStatusByTeam({
        bookingId: "booking-1",
        newStatus: BookingStatus.ACCEPTED,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(prisma.booking.update).not.toHaveBeenCalled()
  })

  it("rejects invalid team status jumps even for scoped bookings", async () => {
    const caller = await callerFor("RENTAL")
    prisma.booking.findUnique.mockResolvedValue(
      bookingFixture({
        item: { titleEn: "Projector", responsibleMembers: [{ id: "rental-1" }] },
      }),
    )

    await expect(
      caller.updateBookingStatusByTeam({
        bookingId: "booking-1",
        newStatus: BookingStatus.BORROWED,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(prisma.booking.update).not.toHaveBeenCalled()
  })

  it("rejects user-created notes that use reserved admin block syntax", async () => {
    const caller = await callerFor("USER", "resident-1")

    await expect(
      caller.create({
        itemId: "item-1",
        start: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        end: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        notes: "  [ADMIN BLOCK] hide this booking",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(prisma.item.findUnique).not.toHaveBeenCalled()
  })
})
