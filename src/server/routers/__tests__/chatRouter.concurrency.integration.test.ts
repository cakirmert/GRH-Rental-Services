// @vitest-environment node
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { localDatabaseUrl } from "../../../../scripts/local-database.mjs"
import type { Context } from "@/server/context"

vi.mock("@/lib/notifications", () => ({ notificationEmitter: { emit: vi.fn() } }))
vi.mock("@/server/email/sendChatMessageEmail", () => ({
  sendChatMessageEmail: vi.fn(async () => {}),
}))

const rawUrl = process.env.GRH_TEST_DATABASE_URL
const target = rawUrl ? localDatabaseUrl(rawUrl) : undefined
const prefix = `chat-security-${randomUUID()}`
const residentId = `${prefix}-resident`
const staffId = `${prefix}-staff`
const itemId = `${prefix}-item`
const bookingId = `${prefix}-booking`

describe.skipIf(!target)("PostgreSQL chat send admission", () => {
  let db: PrismaClient
  let caller: ReturnType<typeof import("../chatRouter").chatRouter.createCaller>

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) })
    await db.user.createMany({
      data: [
        { id: residentId, email: `${residentId}@example.test`, role: "USER" },
        { id: staffId, email: `${staffId}@example.test`, role: "RENTAL" },
      ],
    })
    await db.item.create({
      data: {
        id: itemId,
        type: "SPORTS",
        titleEn: prefix,
        totalQuantity: 1,
      },
    })
    await db.booking.create({
      data: {
        id: bookingId,
        userId: residentId,
        assignedToId: staffId,
        itemId,
        startDate: new Date(Date.now() + 60_000),
        endDate: new Date(Date.now() + 3_600_000),
      },
    })
    await db.bookingChatThread.create({ data: { bookingId } })
    const { chatRouter } = await import("../chatRouter")
    caller = chatRouter.createCaller({
      prisma: db,
      session: {
        user: { id: residentId, role: "USER", email: `${residentId}@example.test` },
        expires: "2099-01-01",
      },
      req: new Request("http://localhost/api/trpc"),
    } as Context)
  })

  afterAll(async () => {
    if (!db) return
    await db.booking.deleteMany({ where: { itemId } })
    await db.item.deleteMany({ where: { id: itemId } })
    await db.user.deleteMany({ where: { id: { in: [residentId, staffId] } } })
    await db.$disconnect()
  })

  it("admits one rapid send and creates only its one notification", async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) => caller.send({ bookingId, body: `Rapid ${index}` })),
    )
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    const thread = await db.bookingChatThread.findUniqueOrThrow({ where: { bookingId } })
    expect(await db.bookingChatMessage.count({ where: { threadId: thread.id } })).toBe(1)
    expect(await db.notification.count({ where: { bookingId } })).toBe(1)
  })

  it("creates one thread for parallel first messages", async () => {
    const firstMessageBookingId = `${prefix}-first-message`
    await db.booking.create({
      data: {
        id: firstMessageBookingId,
        userId: residentId,
        assignedToId: staffId,
        itemId,
        startDate: new Date(Date.now() + 60_000),
        endDate: new Date(Date.now() + 3_600_000),
      },
    })
    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) =>
        caller.send({
          bookingId: firstMessageBookingId,
          body: `First ${index}`,
        }),
      ),
    )
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    expect(await db.bookingChatThread.count({ where: { bookingId: firstMessageBookingId } })).toBe(
      1,
    )
    expect(await db.notification.count({ where: { bookingId: firstMessageBookingId } })).toBe(1)
  })

  it("keeps the ten-consecutive-message limit", async () => {
    const cappedBookingId = `${prefix}-capped`
    await db.booking.create({
      data: {
        id: cappedBookingId,
        userId: residentId,
        assignedToId: staffId,
        itemId,
        startDate: new Date(Date.now() + 60_000),
        endDate: new Date(Date.now() + 3_600_000),
      },
    })
    const thread = await db.bookingChatThread.create({ data: { bookingId: cappedBookingId } })
    await db.bookingChatMessage.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        threadId: thread.id,
        senderId: residentId,
        body: `Earlier ${index}`,
        createdAt: new Date(Date.now() - (index + 2) * 1000),
      })),
    })
    await expect(
      caller.send({ bookingId: cappedBookingId, body: "Eleventh" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Please wait for a response." })
    expect(await db.bookingChatMessage.count({ where: { threadId: thread.id } })).toBe(10)
    expect(await db.notification.count({ where: { bookingId: cappedBookingId } })).toBe(0)
  })

  it("keeps the one-second limit after queued transactions wait for a lock", async () => {
    const delayedBookingId = `${prefix}-delayed`
    await db.booking.create({
      data: {
        id: delayedBookingId,
        userId: residentId,
        assignedToId: staffId,
        itemId,
        startDate: new Date(Date.now() + 60_000),
        endDate: new Date(Date.now() + 3_600_000),
      },
    })
    const thread = await db.bookingChatThread.create({ data: { bookingId: delayedBookingId } })

    let signalHeld!: () => void
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      signalHeld = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`chat-send:${delayedBookingId}`}, 0))`
        signalHeld()
        await gate
      },
      { timeout: 10_000 },
    )
    await held
    const attempts = Promise.allSettled([
      caller.send({ bookingId: delayedBookingId, body: "Queued A" }),
      caller.send({ bookingId: delayedBookingId, body: "Queued B" }),
    ])
    let releasedAt: Date
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500))
    } finally {
      releasedAt = new Date()
      release()
      await blocker
    }

    const outcomes = await attempts
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    expect(
      outcomes
        .filter((outcome) => outcome.status === "rejected")
        .map((outcome) => outcome.reason.code),
    ).toEqual(["TOO_MANY_REQUESTS"])
    const messages = await db.bookingChatMessage.findMany({ where: { threadId: thread.id } })
    expect(messages).toHaveLength(1)
    expect(messages[0].createdAt.getTime()).toBeGreaterThanOrEqual(releasedAt!.getTime() - 100)
    expect(await db.notification.count({ where: { bookingId: delayedBookingId } })).toBe(1)
  })
})
