import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Context } from "@/server/context"
import { parseBerlinDateTime } from "@/lib/recurring-blocks"

vi.mock("@/server/jobs/autoBorrowed", () => ({ markUpcomingBookingsBorrowed: vi.fn() }))
vi.mock("@/server/notifications/bookingStatusNotifier", () => ({
  notifyBookingStatusChange: vi.fn(),
}))
vi.mock("@/server/email/sendBookingRequestEmail", () => ({ sendBookingRequestEmail: vi.fn() }))
vi.mock("@/lib/auth/state", () => ({ consumeBudget: vi.fn().mockResolvedValue(true) }))

const db = {
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  user: { findUnique: vi.fn() },
  item: { findUnique: vi.fn(), findMany: vi.fn() },
  booking: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  recurringBlock: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  recurringBlockException: { upsert: vi.fn() },
  log: { create: vi.fn() },
}
vi.mock("@/lib/prismadb", () => ({ default: db }))

const date = parseBerlinDateTime
const item = {
  id: "item",
  titleEn: "Bar",
  titleDe: "Bar",
  type: "ROOM",
  active: true,
  totalQuantity: 1,
  responsibleMembers: [{ id: "staff" }],
}
const block = () => ({
  id: "series",
  itemId: item.id,
  createdById: "old-admin",
  item,
  startDate: date("2030-01-04T18:00"),
  endDate: date("2030-01-05T12:00"),
  frequency: "WEEKLY",
  timeZone: "Europe/Berlin",
  until: null,
  stoppedFrom: null,
  quantity: 1,
  reason: "Internal setup details",
  exceptions: [],
})
const input = () => ({
  itemId: item.id,
  start: block().startDate.toISOString(),
  end: block().endDate.toISOString(),
  recurrence: { frequency: "WEEKLY" as const },
})
async function caller(role: "ADMIN" | "RENTAL" | "USER" = "RENTAL", id = "staff") {
  const { bookingsRouter } = await import("../bookingRouter")
  return bookingsRouter.createCaller({
    prisma: db as unknown as Context["prisma"],
    session: { user: { id, role, email: `${id}@example.test` }, expires: "2099-01-01" },
    req: new Request("http://localhost/api/trpc"),
  })
}

describe("durable block authorization and booking protection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.user.findUnique.mockResolvedValue({ role: "RENTAL" })
    db.item.findUnique.mockResolvedValue(item)
    db.item.findMany.mockResolvedValue([item])
    db.booking.findMany.mockResolvedValue([])
    db.booking.count.mockResolvedValue(0)
    db.booking.findFirst.mockResolvedValue(null)
    db.recurringBlock.findMany.mockResolvedValue([])
    db.recurringBlock.findUnique.mockResolvedValue(block())
    db.recurringBlock.count.mockResolvedValue(0)
    db.recurringBlock.create.mockResolvedValue(block())
  })

  it("creates one durable indefinite rule for responsible rental staff, without booking copies", async () => {
    expect(await (await caller()).blockSlots(input())).toMatchObject({
      id: "series",
      frequency: "WEEKLY",
      until: null,
      indefinite: true,
    })
    expect(db.recurringBlock.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: "staff",
        until: null,
        frequency: "WEEKLY",
        timeZone: "Europe/Berlin",
      }),
    })
    expect(db.booking.create).not.toHaveBeenCalled()
    expect(db.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    )
  })

  it("lets admins block an unassigned item", async () => {
    db.user.findUnique.mockResolvedValue({ role: "ADMIN" })
    db.item.findUnique.mockResolvedValue({ ...item, responsibleMembers: [] })
    await expect((await caller("ADMIN")).blockSlots(input())).resolves.toMatchObject({
      id: "series",
    })
  })

  it("rejects unrelated rental staff even when the session claims admin", async () => {
    db.item.findUnique.mockResolvedValue({ ...item, responsibleMembers: [] })
    await expect((await caller("ADMIN")).blockSlots(input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(db.recurringBlock.create).not.toHaveBeenCalled()
  })

  it.each(["USER", null])(
    "rejects demoted or deleted staff before reads/writes or budgets (%s)",
    async (role) => {
      db.user.findUnique.mockResolvedValue(role ? { role } : null)
      await expect((await caller("ADMIN")).blockSlots(input())).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      expect(db.item.findUnique).not.toHaveBeenCalled()
      expect(db.recurringBlock.create).not.toHaveBeenCalled()
      const { consumeBudget } = await import("@/lib/auth/state")
      expect(consumeBudget).not.toHaveBeenCalled()
    },
  )

  it("limits the item picker using current responsibility", async () => {
    await (await caller()).blockableItems()
    expect(db.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, responsibleMembers: { some: { id: "staff" } } },
        select: { id: true, titleEn: true, titleDe: true, totalQuantity: true },
      }),
    )
  })

  it("rejects a block that invalidates a pending booking decades after its anchor", async () => {
    const future = date("2099-01-02T19:00") // Friday.
    db.booking.findMany.mockResolvedValue([
      {
        id: "future-booking",
        status: "REQUESTED",
        startDate: future,
        endDate: new Date(future.getTime() + 3600000),
        quantity: 1,
      },
    ])
    await expect((await caller()).blockSlots(input())).rejects.toMatchObject({ code: "CONFLICT" })
    expect(db.recurringBlock.create).not.toHaveBeenCalled()
  })

  it("checks combined block quantities against real bookings, not only each rule alone", async () => {
    db.item.findUnique.mockResolvedValue({ ...item, totalQuantity: 3 })
    db.recurringBlock.findMany.mockResolvedValue([block()])
    db.booking.findMany.mockResolvedValue([
      {
        id: "booking",
        status: "ACCEPTED",
        startDate: block().startDate,
        endDate: block().endDate,
        quantity: 2,
      },
    ])
    await expect((await caller()).blockSlots({ ...input(), quantity: 1 })).rejects.toMatchObject({
      code: "CONFLICT",
    })
  })

  it("allows overlapping restrictions when no concrete booking is invalidated", async () => {
    db.recurringBlock.findMany.mockResolvedValue([block()])
    await expect((await caller()).blockSlots(input())).resolves.toMatchObject({ indefinite: true })
  })

  it("fails closed at the active rule cap", async () => {
    db.recurringBlock.count.mockResolvedValue(100)
    await expect((await caller()).blockSlots(input())).rejects.toMatchObject({ code: "CONFLICT" })
    expect(db.recurringBlock.create).not.toHaveBeenCalled()
  })

  it("rejects invalid date and recurrence ranges", async () => {
    await expect(
      (await caller()).blockSlots({ ...input(), end: date("2030-01-15T12:00").toISOString() }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("rejects arbitrary occurrence keys and unrelated cancellation", async () => {
    await expect(
      (await caller()).cancelBlockOccurrence({
        recurringBlockId: "series",
        occurrenceStart: date("2030-01-04T19:00").toISOString(),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    db.item.findUnique.mockResolvedValue({ ...item, responsibleMembers: [] })
    await expect(
      (await caller()).cancelBlockOccurrence({
        recurringBlockId: "series",
        occurrenceStart: block().startDate.toISOString(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.recurringBlockException.upsert).not.toHaveBeenCalled()
  })

  it("cancels a single occurrence idempotently and never extends an existing series stop", async () => {
    const staff = await caller()
    await staff.cancelBlockOccurrence({
      recurringBlockId: "series",
      occurrenceStart: block().startDate.toISOString(),
    })
    expect(db.recurringBlockException.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { blockId: "series", occurrenceStart: block().startDate },
        update: {},
      }),
    )
    db.recurringBlock.findUnique.mockResolvedValue({ ...block(), stoppedFrom: block().startDate })
    await staff.stopBlockSeries({
      recurringBlockId: "series",
      occurrenceStart: date("2030-01-11T18:00").toISOString(),
    })
    expect(db.recurringBlock.update).toHaveBeenCalledWith({
      where: { id: "series" },
      data: { stoppedFrom: block().startDate },
    })
  })

  it.each(["create", "update", "approve"])(
    "enforces a far-future series for booking %s",
    async (operation) => {
      const future = date("2099-01-02T19:00")
      const end = new Date(future.getTime() + 3600000)
      db.recurringBlock.findMany.mockResolvedValue([block()])
      db.booking.findUnique.mockResolvedValue({
        id: "booking",
        itemId: item.id,
        userId: "staff",
        quantity: 1,
        notes: null,
        status: "REQUESTED",
        startDate: future,
        endDate: end,
        item,
      })
      const staff = await caller("ADMIN")
      const action =
        operation === "create"
          ? staff.create({
              itemId: item.id,
              start: future.toISOString(),
              end: end.toISOString(),
              notes: "Event",
            })
          : operation === "update"
            ? staff.update({ id: "booking", start: future.toISOString(), end: end.toISOString() })
            : staff.updateBookingStatusByTeam({ bookingId: "booking", newStatus: "ACCEPTED" })
      await expect(action).rejects.toMatchObject({
        code: operation === "approve" ? "CONFLICT" : "BAD_REQUEST",
      })
      expect(db.booking.create).not.toHaveBeenCalled()
      expect(db.booking.update).not.toHaveBeenCalled()
    },
  )

  it("returns staff occurrence metadata without inventing a booking owner", async () => {
    db.recurringBlock.findMany.mockResolvedValue([block()])
    const result = await (
      await caller()
    ).getBookings({ start: date("2030-01-04T00:00"), end: date("2030-01-06T00:00") })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      recurringBlockId: "series",
      occurrenceStart: block().startDate,
      frequency: "WEEKLY",
      until: null,
      user: null,
    })
  })

  it("returns only interval/capacity data in public availability", async () => {
    const from = new Date(Date.now() + 86400000)
    const to = new Date(from.getTime() + 86400000)
    db.recurringBlock.findMany.mockResolvedValue([
      { ...block(), frequency: "NONE", startDate: from, endDate: to },
    ])
    const result = await (
      await caller("USER")
    ).availability({ itemId: item.id, from: from.toISOString(), to: to.toISOString() })
    expect(result).toHaveLength(1)
    expect(Object.keys(result[0]).sort()).toEqual([
      "endDate",
      "id",
      "quantity",
      "startDate",
      "status",
    ])
    expect(JSON.stringify(result)).not.toContain("Internal setup details")
    expect(JSON.stringify(result)).not.toContain("old-admin")
  })
})
