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
  $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma)),
  booking: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
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
vi.mock("@/lib/auth/state", () => ({ consumeBudget: vi.fn().mockResolvedValue(true) }))

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
    prisma.booking.count.mockResolvedValue(0)
    prisma.booking.findFirst.mockResolvedValue(null)
  })

  it("requires serializable isolation for a booking transition", async () => {
    const caller = await callerFor("ADMIN")
    const booking = bookingFixture()
    prisma.booking.findUnique.mockResolvedValue(booking)
    prisma.booking.update.mockResolvedValue({ ...booking, status: BookingStatus.DECLINED })
    await caller.updateBookingStatusByTeam({
      bookingId: "booking-1",
      newStatus: BookingStatus.DECLINED,
    })
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    )
  })

  it("rejects acceptance when overlapping inventory is exhausted", async () => {
    const caller = await callerFor("ADMIN")
    const booking = bookingFixture({
      itemId: "item-1",
      quantity: 1,
      item: { active: true, totalQuantity: 1, titleEn: "Projector" },
    })
    prisma.booking.findUnique.mockResolvedValue(booking)
    prisma.booking.findMany.mockResolvedValue([
      { startDate: booking.startDate, endDate: booking.endDate, quantity: 1 },
    ])
    await expect(
      caller.updateBookingStatusByTeam({
        bookingId: "booking-1",
        newStatus: BookingStatus.ACCEPTED,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(prisma.booking.update).not.toHaveBeenCalled()
  })

  it("rejects new bookings for inactive items", async () => {
    const caller = await callerFor("USER", "resident-1")
    prisma.item.findUnique.mockResolvedValue({ active: false })
    await expect(
      caller.create({
        itemId: "item-1",
        start: new Date(Date.now() + 3600000).toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(prisma.booking.create).not.toHaveBeenCalled()
  })

  it("rejects duplicate pending booking requests before notifications", async () => {
    const caller = await callerFor("USER", "resident-1")
    prisma.item.findUnique.mockResolvedValue({ active: true, type: "SPORTS", totalQuantity: 2 })
    prisma.booking.findFirst.mockResolvedValue({ id: "existing" })
    await expect(
      caller.create({
        itemId: "item-1",
        start: new Date(Date.now() + 3600000).toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(prisma.booking.create).not.toHaveBeenCalled()
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })

  it("hides both legacy staff notes and the new staffNotes column from owners", async () => {
    const caller = await callerFor("USER", "resident-1")
    prisma.booking.findMany.mockResolvedValue([
      {
        id: "booking-1",
        notes: "Party\n\nRental Team (2026):\nPrivate",
        staffNotes: "More private",
      },
    ])
    const result = await caller.list({})
    expect(result).toEqual([{ id: "booking-1", notes: "Party" }])
  })

  it("preserves legacy staff notes when an owner updates their note", async () => {
    const caller = await callerFor("USER", "resident-1")
    const booking = bookingFixture({
      notes: "Party\n\nRental Team (2026):\nPrivate",
      staffNotes: "Another internal note",
    })
    prisma.booking.findUnique.mockResolvedValue(booking)
    prisma.booking.update.mockResolvedValue({ ...booking, notes: "Changed" })
    const result = await caller.update({
      id: "booking-1",
      start: new Date(Date.now() + 3600000).toISOString(),
      end: new Date(Date.now() + 7200000).toISOString(),
      notes: "Changed",
    })
    expect(prisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: "Changed",
          staffNotes: "Rental Team (2026):\nPrivate\n\nAnother internal note",
        }),
      }),
    )
    expect(result).not.toHaveProperty("staffNotes")
  })

  it("bounds public availability ranges before querying", async () => {
    const caller = await callerFor("USER")
    await expect(
      caller.availability({
        itemId: "item-1",
        from: new Date().toISOString(),
        to: new Date(Date.now() + 100 * 86400000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(prisma.booking.findMany).not.toHaveBeenCalled()
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
