// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { localDatabaseUrl } from "../../../scripts/local-database.mjs"
import { parseBerlinDateTime } from "@/lib/recurring-blocks"
import type { Context } from "@/server/context"

vi.mock("@/lib/prismadb", () => ({ default: { log: { create: vi.fn() } } }))
vi.mock("@/server/jobs/autoBorrowed", () => ({ markUpcomingBookingsBorrowed: vi.fn() }))
vi.mock("@/server/notifications/bookingStatusNotifier", () => ({
  notifyBookingStatusChange: vi.fn(),
}))
vi.mock("@/server/email/sendBookingRequestEmail", () => ({ sendBookingRequestEmail: vi.fn() }))
// Capacity races are tested independently from the separately tested durable budgets.
vi.mock("@/lib/auth/state", () => ({ consumeBudget: vi.fn().mockResolvedValue(true) }))

const rawUrl = process.env.GRH_TEST_DATABASE_URL
const target = rawUrl ? localDatabaseUrl(rawUrl) : undefined
const prefix = `recurring-block-test-${randomUUID()}`
const date = parseBerlinDateTime
const first = date("2030-01-04T18:00")
const last = date("2030-01-05T12:00")
const farStart = date("2099-01-02T19:00")
const farEnd = date("2099-01-02T20:00")

describe.skipIf(!target)("durable blocks in disposable PostgreSQL", () => {
  let db: PrismaClient
  let router: typeof import("../routers/bookingRouter").bookingsRouter
  const actor = `${prefix}-staff`
  const admin = `${prefix}-admin`
  const user = `${prefix}-user`
  const itemIds: string[] = []

  function asUser(id: string, role: "ADMIN" | "RENTAL" | "USER") {
    return router.createCaller({
      prisma: db,
      session: { user: { id, role, email: `${id}@example.test` }, expires: "2099-01-01" },
      req: new Request("http://localhost/api/trpc"),
    } as Context)
  }
  async function makeItem(name: string, quantity = 1, assigned = true) {
    const id = `${prefix}-${name}`
    itemIds.push(id)
    return db.item.create({
      data: {
        id,
        titleEn: "Synthetic recurrence fixture",
        type: "SPORTS",
        totalQuantity: quantity,
        ...(assigned ? { responsibleMembers: { connect: { id: actor } } } : {}),
      },
    })
  }
  function blockInput(itemId: string, quantity = 1) {
    return {
      itemId,
      quantity,
      start: first.toISOString(),
      end: last.toISOString(),
      recurrence: { frequency: "WEEKLY" as const },
    }
  }
  function bookingInput(itemId: string) {
    return { itemId, start: farStart.toISOString(), end: farEnd.toISOString() }
  }
  async function savedBooking(
    itemId: string,
    status: "REQUESTED" | "ACCEPTED" = "REQUESTED",
    quantity = 1,
  ) {
    return db.booking.create({
      data: { userId: user, itemId, startDate: farStart, endDate: farEnd, status, quantity },
    })
  }

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) })
    await db.user.createMany({
      data: [
        {
          id: actor,
          email: `${actor}@example.test`,
          role: "RENTAL",
          emailBookingNotifications: false,
        },
        {
          id: admin,
          email: `${admin}@example.test`,
          role: "ADMIN",
          emailBookingNotifications: false,
        },
        { id: user, email: `${user}@example.test`, role: "USER", emailBookingNotifications: false },
      ],
    })
    router = (await import("../routers/bookingRouter")).bookingsRouter
  })

  afterAll(async () => {
    if (!db) return
    await db.notification.deleteMany({ where: { userId: { in: [actor, admin, user] } } })
    await db.booking.deleteMany({ where: { itemId: { in: itemIds } } })
    await db.recurringBlock.deleteMany({ where: { itemId: { in: itemIds } } })
    await db.item.deleteMany({ where: { id: { in: itemIds } } })
    await db.user.deleteMany({ where: { id: { in: [actor, admin, user] } } })
    await db.$disconnect()
  })

  it("keeps a rule effective decades later with no generated booking rows", async () => {
    const item = await makeItem("indefinite")
    const result = await asUser(actor, "RENTAL").blockSlots(blockInput(item.id))
    expect(result.indefinite).toBe(true)
    expect(await db.booking.count({ where: { itemId: item.id } })).toBe(0)
    expect(await db.recurringBlock.count({ where: { itemId: item.id } })).toBe(1)
    const calendar = await asUser(actor, "RENTAL").getBookings({ start: farStart, end: farEnd })
    expect(
      calendar.some((row) => "recurringBlockId" in row && row.recurringBlockId === result.id),
    ).toBe(true)
    await expect(asUser(user, "USER").create(bookingInput(item.id))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("does not invalidate an existing pending booking decades later", async () => {
    const item = await makeItem("existing-request")
    const booking = await savedBooking(item.id)
    await expect(asUser(actor, "RENTAL").blockSlots(blockInput(item.id))).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(await db.recurringBlock.count({ where: { itemId: item.id } })).toBe(0)
    expect(await db.booking.findUnique({ where: { id: booking.id } })).toMatchObject({
      status: "REQUESTED",
      startDate: farStart,
      endDate: farEnd,
    })
  })

  it("adds overlapping rule quantities when protecting existing bookings", async () => {
    const item = await makeItem("partial-quantity", 3)
    await savedBooking(item.id, "ACCEPTED", 2)
    await asUser(actor, "RENTAL").blockSlots(blockInput(item.id, 1))
    await expect(asUser(actor, "RENTAL").blockSlots(blockInput(item.id, 1))).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(await db.recurringBlock.count({ where: { itemId: item.id } })).toBe(1)
  })

  it("rejects unassigned staff and stale promoted session claims", async () => {
    const item = await makeItem("unassigned", 1, false)
    await expect(asUser(actor, "ADMIN").blockSlots(blockInput(item.id))).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(asUser(user, "ADMIN").blockSlots(blockInput(item.id))).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect((await asUser(actor, "RENTAL").blockableItems()).some((row) => row.id === item.id)).toBe(
      false,
    )
    await expect(asUser(admin, "ADMIN").blockSlots(blockInput(item.id))).resolves.toMatchObject({
      indefinite: true,
    })
  })

  it("persists an idempotent single exception and cannot extend a stopped series", async () => {
    const item = await makeItem("cancellation")
    const staff = asUser(actor, "RENTAL")
    const result = await staff.blockSlots(blockInput(item.id))
    const occurrenceStart = date("2030-01-11T18:00").toISOString()
    const input = { recurringBlockId: result.id, occurrenceStart }
    await staff.cancelBlockOccurrence(input)
    await staff.cancelBlockOccurrence(input)
    expect(await db.recurringBlockException.count({ where: { blockId: result.id } })).toBe(1)
    await staff.stopBlockSeries({
      recurringBlockId: result.id,
      occurrenceStart: date("2030-01-18T18:00").toISOString(),
    })
    await asUser(user, "USER").create(bookingInput(item.id))
    await staff.stopBlockSeries({
      recurringBlockId: result.id,
      occurrenceStart: date("2099-01-02T18:00").toISOString(),
    })
    expect(await db.recurringBlock.findUnique({ where: { id: result.id } })).toMatchObject({
      stoppedFrom: date("2030-01-18T18:00"),
    })
  })

  it("allows at most one winner when an indefinite block races a future booking request", async () => {
    for (let i = 0; i < 3; i++) {
      const item = await makeItem(`create-race-${i}`)
      const results = await Promise.allSettled([
        asUser(actor, "RENTAL").blockSlots(blockInput(item.id)),
        asUser(user, "USER").create(bookingInput(item.id)),
      ])
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
      const saved = await db.booking.count({ where: { itemId: item.id } })
      const rules = await db.recurringBlock.count({ where: { itemId: item.id } })
      expect(saved + rules).toBe(1)
    }
  })

  it("cannot race approval into excess combined capacity", async () => {
    const item = await makeItem("accept-race", 2)
    const pending = await savedBooking(item.id)
    const results = await Promise.allSettled([
      asUser(actor, "RENTAL").blockSlots(blockInput(item.id, 2)),
      asUser(actor, "RENTAL").updateBookingStatusByTeam({
        bookingId: pending.id,
        newStatus: "ACCEPTED",
      }),
    ])
    expect(results.some((result) => result.status === "fulfilled")).toBe(true)
    expect(await db.recurringBlock.count({ where: { itemId: item.id } })).toBe(0)
    expect(await db.booking.findUnique({ where: { id: pending.id } })).toMatchObject({
      status: "ACCEPTED",
    })
  })

  it("serializes competing partial rules that would jointly invalidate a saved booking", async () => {
    const item = await makeItem("partial-rule-race", 2)
    await savedBooking(item.id, "ACCEPTED", 1)
    const results = await Promise.allSettled([
      asUser(actor, "RENTAL").blockSlots(blockInput(item.id, 1)),
      asUser(admin, "ADMIN").blockSlots(blockInput(item.id, 1)),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(await db.recurringBlock.count({ where: { itemId: item.id } })).toBe(1)
  })

  it("protects owner edits racing a newly created block", async () => {
    const item = await makeItem("edit-race")
    const initial = await db.booking.create({
      data: {
        userId: user,
        itemId: item.id,
        startDate: date("2099-01-01T10:00"),
        endDate: date("2099-01-01T11:00"),
      },
    })
    const results = await Promise.allSettled([
      asUser(actor, "RENTAL").blockSlots(blockInput(item.id)),
      asUser(user, "USER").update({
        id: initial.id,
        start: farStart.toISOString(),
        end: farEnd.toISOString(),
      }),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const final = await db.booking.findUniqueOrThrow({ where: { id: initial.id } })
    const rules = await db.recurringBlock.count({ where: { itemId: item.id } })
    expect(rules === 0 || final.startDate.getTime() !== farStart.getTime()).toBe(true)
  })

  it("keeps the rule after its creator account is deleted", async () => {
    const item = await makeItem("creator-deletion", 1, false)
    const result = await asUser(admin, "ADMIN").blockSlots(blockInput(item.id))
    await db.user.delete({ where: { id: admin } })
    expect(await db.recurringBlock.findUnique({ where: { id: result.id } })).toMatchObject({
      createdById: null,
    })
    await expect(asUser(user, "USER").create(bookingInput(item.id))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })
})
