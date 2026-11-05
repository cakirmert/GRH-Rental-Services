import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const testUrl = process.env.GRH_TEST_DATABASE_URL
if (testUrl && !["127.0.0.1", "localhost"].includes(new URL(testUrl).hostname)) {
  throw new Error("Cleanup tests require a disposable local database")
}
const prefix = `cleanup-security-${randomUUID()}`
let db: PrismaClient

describe.skipIf(!testUrl)("PostgreSQL inactive-user cleanup", () => {
  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl! }) })
    // Restrict candidate selection to synthetic fixtures; preserve the job's real
    // relational filter, ordering, limit, and transactional database operations.
    vi.doMock("@/lib/prismadb", () => ({
      default: {
        user: {
          findMany: (args: Parameters<typeof db.user.findMany>[0]) =>
            db.user.findMany({
              ...args,
              where: { AND: [args?.where ?? {}, { id: { startsWith: prefix } }] },
            }),
        },
        $transaction: db.$transaction.bind(db),
      },
    }))
    await db.item.create({
      data: { id: prefix, type: "SPORTS", titleEn: "Cleanup fixture", totalQuantity: 1 },
    })
  })

  afterAll(async () => {
    if (!db) return
    await db.booking.deleteMany({ where: { itemId: prefix } })
    await db.item.deleteMany({ where: { id: prefix } })
    await db.user.deleteMany({ where: { id: { startsWith: prefix } } })
    await db.$disconnect()
    vi.doUnmock("@/lib/prismadb")
  })

  it("reaches eligible users after 100 protected users without deleting operational records", async () => {
    const inactiveSince = new Date(Date.now() - 730 * 86400000)
    const protectedIds = Array.from(
      { length: 100 },
      (_, i) => `${prefix}-${String(i).padStart(3, "0")}`,
    )
    const eligibleId = `${prefix}-z-eligible`
    const ownerId = `${prefix}-z-active-owner`
    await db.user.createMany({
      data: [
        ...[...protectedIds, eligibleId].map((id) => ({
          id,
          email: `${id}@example.test`,
          lastLoginAt: inactiveSince,
        })),
        { id: ownerId, email: `${ownerId}@example.test`, lastLoginAt: new Date() },
      ],
    })
    const past = new Date(Date.now() - 86400000)
    const future = new Date(Date.now() + 86400000)
    await db.booking.createMany({
      data: protectedIds.map((id, index) => ({
        id: `${id}-booking`,
        itemId: prefix,
        // Exercise both owner and assignee exclusions and both active and future protection.
        userId: index % 2 === 0 ? id : ownerId,
        assignedToId: index % 2 === 0 ? null : id,
        startDate: past,
        endDate: index % 4 < 2 ? past : future,
        status: index % 4 < 2 ? ("REQUESTED" as const) : ("COMPLETED" as const),
      })),
    })
    const { deleteInactiveUsers } = await import("../deleteInactiveUsers")
    await deleteInactiveUsers()

    expect(await db.user.findUnique({ where: { id: eligibleId } })).toBeNull()
    expect(await db.user.count({ where: { id: { in: protectedIds } } })).toBe(100)
    expect(await db.booking.count({ where: { itemId: prefix } })).toBe(100)
  })
})
