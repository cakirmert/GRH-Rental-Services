// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { BookingStatus, PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { localDatabaseUrl } from "../../../scripts/local-database.mjs"
import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"
import type { Context } from "@/server/context"

vi.mock("@/lib/prismadb", () => ({ default: { log: { create: vi.fn() } } }))
vi.mock("@/server/jobs/autoBorrowed", () => ({ markUpcomingBookingsBorrowed: vi.fn() }))
vi.mock("@/server/notifications/bookingStatusNotifier", () => ({
  notifyBookingStatusChange: vi.fn(),
}))
vi.mock("@/server/email/sendBookingRequestEmail", () => ({ sendBookingRequestEmail: vi.fn() }))

const rawUrl = process.env.GRH_TEST_DATABASE_URL
const target = rawUrl ? localDatabaseUrl(rawUrl) : undefined
const prefix = `staff-list-${randomUUID()}`
const staffId = `${prefix}-staff`
const adminId = `${prefix}-admin`
const residentId = `${prefix}-resident`
const itemId = `${prefix}-assigned`
const otherItemId = `${prefix}-other`
const id = (name: string) => `${prefix}-${name}`

describe.skipIf(!target)("staff lists with nullable notes in PostgreSQL", () => {
  let db: PrismaClient
  let router: typeof import("../routers/bookingRouter").bookingsRouter
  function caller(actorId: string, role: "RENTAL" | "ADMIN") {
    return router.createCaller({
      prisma: db,
      session: {
        user: { id: actorId, role, email: `${actorId}@example.test` },
        expires: "2099-01-01",
      },
      req: new Request("http://localhost/api/trpc"),
    } as Context)
  }

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) })
    await db.user.createMany({
      data: [
        { id: staffId, email: `${staffId}@example.test`, role: "RENTAL" },
        { id: adminId, email: `${adminId}@example.test`, role: "ADMIN" },
        { id: residentId, email: `${residentId}@example.test`, role: "USER" },
      ],
    })
    await db.item.create({
      data: {
        id: itemId,
        type: "SPORTS",
        titleEn: prefix,
        totalQuantity: 20,
        responsibleMembers: { connect: { id: staffId } },
      },
    })
    await db.item.create({
      data: { id: otherItemId, type: "SPORTS", titleEn: prefix, totalQuantity: 20 },
    })
    const fixtures: Array<{ name: string; status: BookingStatus; notes: string | null }> = [
      { name: "requested-null", status: "REQUESTED", notes: null },
      { name: "accepted-null", status: "ACCEPTED", notes: null },
      { name: "accepted-empty", status: "ACCEPTED", notes: "" },
      { name: "accepted-note", status: "ACCEPTED", notes: "Synthetic ordinary request" },
      { name: "borrowed-null", status: "BORROWED", notes: null },
      { name: "finished-null", status: "COMPLETED", notes: null },
      { name: "block", status: "ACCEPTED", notes: `${ADMIN_BLOCK_PREFIX} Synthetic block` },
    ]
    await db.booking.createMany({
      data: fixtures.map(({ name, ...data }) => ({
        id: id(name),
        userId: residentId,
        itemId,
        startDate: new Date("2090-01-01T12:00:00Z"),
        endDate: new Date("2090-01-01T13:00:00Z"),
        ...data,
      })),
    })
    await db.booking.create({
      data: {
        id: id("unassigned-null"),
        userId: residentId,
        itemId: otherItemId,
        startDate: new Date("2090-01-01T12:00:00Z"),
        endDate: new Date("2090-01-01T13:00:00Z"),
        status: "ACCEPTED",
        notes: null,
      },
    })
    router = (await import("../routers/bookingRouter")).bookingsRouter
  })

  afterAll(async () => {
    if (!db) return
    await db.booking.deleteMany({ where: { itemId: { in: [itemId, otherItemId] } } })
    await db.item.deleteMany({ where: { id: { in: [itemId, otherItemId] } } })
    await db.user.deleteMany({ where: { id: { in: [staffId, adminId, residentId] } } })
    await db.$disconnect()
  })

  it("includes notes-free active requests, accepted and borrowed bookings by default", async () => {
    const result = await caller(staffId, "RENTAL").listForRentalTeam({ searchTerm: prefix })
    expect(result.bookings.map((row) => row.id).sort()).toEqual(
      ["requested-null", "accepted-null", "accepted-empty", "accepted-note", "borrowed-null"]
        .map(id)
        .sort(),
    )
  })

  it("includes NULL and empty notes in accepted bookings while excluding actual blocks", async () => {
    const result = await caller(staffId, "RENTAL").listForRentalTeam({
      status: "ACCEPTED",
      searchTerm: prefix,
    })
    expect(result.bookings.map((row) => row.id).sort()).toEqual(
      ["accepted-null", "accepted-empty", "accepted-note"].map(id).sort(),
    )
  })

  it("does not let the null-note branch bypass item responsibility or search", async () => {
    const result = await caller(staffId, "RENTAL").listForRentalTeam({ searchTerm: prefix })
    expect(result.bookings.some((row) => row.id === id("unassigned-null"))).toBe(false)
    expect(
      (await caller(staffId, "RENTAL").listForRentalTeam({ searchTerm: `${prefix}-no-match` }))
        .bookings,
    ).toEqual([])
  })

  it("lets admins see notes-free bookings on unassigned items as well", async () => {
    const result = await caller(adminId, "ADMIN").listForRentalTeam({
      status: "ACCEPTED",
      searchTerm: prefix,
    })
    expect(result.bookings.map((row) => row.id).sort()).toEqual(
      ["accepted-null", "accepted-empty", "accepted-note", "unassigned-null"].map(id).sort(),
    )
  })
})
