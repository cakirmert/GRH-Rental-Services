import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import type { Context } from "@/server/context"

vi.mock("@/lib/prismadb", () => ({ default: { log: { create: vi.fn() } } }))
vi.mock("@/server/jobs/autoBorrowed", () => ({ markUpcomingBookingsBorrowed: vi.fn() }))
vi.mock("@/server/notifications/bookingStatusNotifier", () => ({
  notifyBookingStatusChange: vi.fn(),
}))
vi.mock("@/server/email/sendBookingRequestEmail", () => ({ sendBookingRequestEmail: vi.fn() }))

const testUrl = process.env.GRH_TEST_DATABASE_URL
const enabled = Boolean(testUrl)
if (testUrl && !["127.0.0.1", "localhost"].includes(new URL(testUrl).hostname)) {
  throw new Error("Concurrency tests require a disposable local database")
}
const prefix = `booking-security-${randomUUID()}`
let db: PrismaClient
let caller: ReturnType<
  (typeof import("../routers/bookingRouter"))["bookingsRouter"]["createCaller"]
>
const startDate = new Date(Date.now() + 3600000)
const endDate = new Date(Date.now() + 7200000)

describe.skipIf(!enabled)("PostgreSQL booking invariants", () => {
  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl! }) })
    await db.user.create({ data: { id: prefix, email: `${prefix}@example.test`, role: "ADMIN" } })
    await db.item.create({
      data: { id: prefix, type: "SPORTS", titleEn: "Concurrency fixture", totalQuantity: 1 },
    })
    const { bookingsRouter } = await import("../routers/bookingRouter")
    caller = bookingsRouter.createCaller({
      prisma: db,
      session: {
        user: { id: prefix, role: "ADMIN", email: `${prefix}@example.test` },
        expires: "2099-01-01",
      },
      req: new Request("http://localhost"),
    } as Context)
  })

  afterAll(async () => {
    if (!db) return
    await db.booking.deleteMany({ where: { itemId: prefix } })
    await db.item.deleteMany({ where: { id: prefix } })
    await db.user.deleteMany({ where: { id: prefix } })
    await db.$disconnect()
  })

  it("allows only one overlapping acceptance for one unit", async () => {
    const bookings = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        db.booking.create({
          data: {
            id: `${prefix}-capacity-${i}`,
            userId: prefix,
            itemId: prefix,
            startDate,
            endDate,
            quantity: 1,
          },
        }),
      ),
    )
    const outcomes = await Promise.allSettled(
      bookings.map((booking) =>
        caller.updateBookingStatusByTeam({ bookingId: booking.id, newStatus: "ACCEPTED" }),
      ),
    )
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(await db.booking.count({ where: { itemId: prefix, status: "ACCEPTED" } })).toBe(1)
    await db.booking.deleteMany({ where: { itemId: prefix } })
  })

  it("does not allow an owner edit to rewind a concurrently borrowed booking", async () => {
    const booking = await db.booking.create({
      data: {
        id: `${prefix}-transition`,
        userId: prefix,
        itemId: prefix,
        startDate,
        endDate,
        status: "ACCEPTED",
      },
    })
    const outcomes = await Promise.allSettled([
      caller.updateBookingStatusByTeam({ bookingId: booking.id, newStatus: "BORROWED" }),
      caller.update({
        id: booking.id,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        notes: "Revised request",
      }),
    ])
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const final = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    expect(["BORROWED", "REQUESTED"]).toContain(final.status)
  })
})
