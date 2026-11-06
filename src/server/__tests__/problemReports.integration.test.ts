// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID, createHash } from "node:crypto"
import { Prisma, PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { localDatabaseUrl } from "../../../scripts/local-database.mjs"
import type { Context } from "@/server/context"

const target = process.env.GRH_TEST_DATABASE_URL ? localDatabaseUrl(process.env.GRH_TEST_DATABASE_URL) : undefined
const prefix = `problem-report-test-${randomUUID()}`
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
const production = {
  NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production", GITHUB_REPORTS_ENABLED: "true",
  GITHUB_ISSUES_TOKEN: "fake-test-token", ORIGIN: "https://app.example.test",
  DATABASE_URL: "postgresql://example:fake@db.example.test/example",
} satisfies NodeJS.ProcessEnv
const input = () => ({ requestId: randomUUID(), category: "problem" as const, title: "Calendar issue",
  description: "Synthetic test: unable to select an available calendar date.", publicPostingConsent: true as const })

describe.skipIf(!target)("PostgreSQL public-report idempotency, delivery and erasure", () => {
  let db: PrismaClient
  let router: typeof import("../routers/problemReportsRouter").problemReportsRouter
  let delivery: typeof import("../problemReports")
  let deletion: typeof import("../accountDeletion").deleteAccountData
  let state: typeof import("@/lib/auth/state")
  let sequence = 0
  let ownsLock = false
  const originalFetch = global.fetch
  const forbiddenNetwork = vi.fn(async () => { throw new Error("Unmocked external request forbidden") })
  const user = () => db.user.create({ data: {
    id: `${prefix}-${++sequence}`, email: `${prefix}-${sequence}@example.test`,
  } })
  const asUser = (id: string) => router.createCaller({
    prisma: db, session: { user: { id, role: "USER", email: "not-published@example.test" }, expires: "2099-01-01" },
    req: new Request("http://localhost"),
  } as Context)
  const releaseLock = () => db.authState.updateMany({ where: { key: "problem-report-delivery-lock" },
    data: { expiresAt: new Date(0) } })

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target! }) })
    // Only this test's new lock may be touched; never replace existing application state.
    expect(await db.authState.findUnique({ where: { key: "problem-report-delivery-lock" } })).toBeNull()
    ownsLock = true
    global.fetch = forbiddenNetwork
    vi.doMock("@/lib/prismadb", () => ({ default: db }))
    // Exercise the real atomic budget SQL, isolated under a synthetic scope.
    vi.doMock("@/lib/auth/state", async () => {
      const actual = await vi.importActual<typeof import("@/lib/auth/state")>("@/lib/auth/state")
      return { ...actual, consumeBudget: (scope: string, subject: string, limit: number, window: number, tx: Prisma.TransactionClient) =>
        actual.consumeBudget(`${scope}-${prefix}`, subject, limit, window, tx) }
    })
    router = (await import("../routers/problemReportsRouter")).problemReportsRouter
    delivery = await import("../problemReports")
    deletion = (await import("../accountDeletion")).deleteAccountData
    state = await import("@/lib/auth/state")
  })

  afterAll(async () => {
    global.fetch = originalFetch
    if (db) {
      await db.user.deleteMany({ where: { id: { startsWith: prefix } } })
      await db.authState.deleteMany({ where: { OR: [
        { key: { contains: prefix } }, ...(ownsLock ? [{ key: "problem-report-delivery-lock" }] : []),
      ] } })
      await db.$disconnect()
    }
    vi.doUnmock("@/lib/prismadb")
    vi.doUnmock("@/lib/auth/state")
  })

  it("concurrent identical retries commit one report and charge one durable admission", async () => {
    const account = await user()
    const request = input()
    const results = await Promise.all(Array.from({ length: 4 }, () => asUser(account.id).submit(request)))
    expect(new Set(results.map(row => row.id)).size).toBe(1)
    expect(results.every(row => row.status === "queued" && row.issueUrl === null)).toBe(true)
    expect(await db.problemReport.count({ where: { userId: account.id } })).toBe(1)
    const budget = await db.authState.findUnique({ where: { key: `rate:problem-report-user-${prefix}:${hash(account.id)}` } })
    expect(budget?.value).toEqual({ count: 1 })
    await expect(asUser(account.id).submit({ ...request, title: "Changed payload" })).rejects.toMatchObject({ code: "CONFLICT" })
    expect(forbiddenNetwork).not.toHaveBeenCalled()
  })

  it("enforces five new reports per day while allowing an identical retry", async () => {
    const account = await user()
    const first = input()
    await asUser(account.id).submit(first)
    for (let i = 0; i < 4; i++) await asUser(account.id).submit(input())
    await expect(asUser(account.id).submit(input())).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
    expect((await asUser(account.id).submit(first)).status).toBe("queued")
    expect(await db.problemReport.count({ where: { userId: account.id } })).toBe(5)
  })

  it("competing workers create exactly one issue, and published retries do not acquire the lock", async () => {
    const account = await user()
    const saved = await asUser(account.id).submit(input())
    const network = vi.fn<typeof fetch>(async () => Response.json({ number: 9001 }, { status: 201 }))
    const results = await Promise.all(Array.from({ length: 4 }, () =>
      delivery.deliverProblemReport(saved.id, db, { env: production, fetch: network })))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(network).toHaveBeenCalledTimes(1)
    expect(await db.problemReport.findUnique({ where: { id: saved.id } })).toMatchObject({ status: "PUBLISHED", issueNumber: 9001 })
    const lock = await db.authState.findUniqueOrThrow({ where: { key: "problem-report-delivery-lock" } })
    await delivery.deliverProblemReport(saved.id, db, { env: production, fetch: network })
    expect((await db.authState.findUniqueOrThrow({ where: { key: lock.key } })).expiresAt).toEqual(lock.expiresAt)
    expect(network).toHaveBeenCalledTimes(1)
    await releaseLock()
  })

  it("reconciles a timed-out create without ever issuing a second POST", async () => {
    const account = await user()
    const saved = await asUser(account.id).submit(input())
    const create = vi.fn<typeof fetch>(async () => { throw new Error("timeout after accepted remote write") })
    await delivery.deliverProblemReport(saved.id, db, { env: production, fetch: create })
    expect(await db.problemReport.findUnique({ where: { id: saved.id } })).toMatchObject({ status: "NEEDS_REVIEW", deliveryAttempts: 1 })
    await releaseLock()
    await db.problemReport.update({ where: { id: saved.id }, data: { nextAttemptAt: new Date(0) } })
    const reconcile = vi.fn<typeof fetch>(async () => Response.json([{ number: 9002, body: `report\n<!-- grh-report:${saved.id} -->` }]))
    await delivery.deliverProblemReport(saved.id, db, { env: production, fetch: reconcile })
    expect(reconcile.mock.calls.every(([, init]) => !init?.method)).toBe(true)
    expect(await db.problemReport.findUnique({ where: { id: saved.id } })).toMatchObject({ status: "PUBLISHED", issueNumber: 9002, deliveryAttempts: 1 })
    await releaseLock()
  })

  it("account erasure cascades pending/published payloads and rejects stale sessions", async () => {
    const account = await user()
    const pending = await asUser(account.id).submit(input())
    const published = await asUser(account.id).submit(input())
    await db.problemReport.update({ where: { id: published.id }, data: { status: "PUBLISHED", issueNumber: 9003 } })
    await db.$transaction(tx => deletion(tx, { id: account.id, email: account.email }))
    expect(await db.problemReport.count({ where: { id: { in: [pending.id, published.id] } } })).toBe(0)
    await expect(asUser(account.id).submit(input())).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    const network = vi.fn<typeof fetch>()
    expect(await delivery.deliverProblemReport(pending.id, db, { env: production, fetch: network })).toBe(false)
    expect(network).not.toHaveBeenCalled()
    await expect(db.problemReport.create({ data: {
      userId: account.id, ...input(), publicPostingConsent: undefined, publicConsentAt: new Date(), expiresAt: new Date(),
    } as never })).rejects.toMatchObject({ code: "P2003" })
  })

  it("drains multiple queued reports with separated POSTs and truthful counts", async () => {
    const account = await user()
    const first = await asUser(account.id).submit(input())
    const second = await asUser(account.id).submit(input())
    const scoped = db.$extends({ query: { problemReport: { findMany: ({ args, query }) => query({
      ...args, where: { AND: [args.where ?? {}, { userId: account.id }] },
    }) } } }) as unknown as PrismaClient
    const sentAt: number[] = []
    const network = vi.fn<typeof fetch>(async () => {
      sentAt.push(Date.now())
      return Response.json({ number: 9100 + sentAt.length }, { status: 201 })
    })
    expect(await delivery.processProblemReports(scoped, { env: production, fetch: network }))
      .toEqual({ attempted: 2, skipped: 0 })
    expect(network).toHaveBeenCalledTimes(2)
    expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(1000)
    expect(await db.problemReport.count({ where: { id: { in: [first.id, second.id] }, status: "PUBLISHED" } })).toBe(2)
    await releaseLock()
  })

  it("expires both delivered and undelivered local payloads, preserving unexpired rows", async () => {
    const account = await user()
    const expired = await asUser(account.id).submit(input())
    const delivered = await asUser(account.id).submit(input())
    const retained = await asUser(account.id).submit(input())
    await db.problemReport.updateMany({ where: { id: { in: [expired.id, delivered.id] } }, data: { expiresAt: new Date(0) } })
    await db.problemReport.update({ where: { id: delivered.id }, data: { status: "PUBLISHED", issueNumber: 9004 } })
    // Never allow a test housekeeping call to select another account's original records.
    const scoped = db.$extends({ query: { problemReport: { findMany: ({ args, query }) => query({
      ...args, where: { AND: [args.where ?? {}, { userId: account.id }] },
    }) } } }) as unknown as PrismaClient
    expect(await delivery.cleanExpiredProblemReports(scoped)).toEqual({ deleted: 2 })
    expect(await db.problemReport.findUnique({ where: { id: retained.id } })).not.toBeNull()
    expect(await db.problemReport.count({ where: { userId: account.id } })).toBe(1)
    expect(forbiddenNetwork).not.toHaveBeenCalled()
  })

  it("auth-state expiry cleanup preserves a concurrently renewed delivery/rate row", async () => {
    const key = `${prefix}-expiry-race`
    await db.authState.create({ data: { key, value: { count: 1 }, expiresAt: new Date(0) } })
    let unlock!: () => void
    let signalRenewed!: () => void
    const release = new Promise<void>(resolve => { unlock = resolve })
    const renewed = new Promise<void>(resolve => { signalRenewed = resolve })
    const renewal = db.$transaction(async tx => {
      await tx.authState.update({ where: { key }, data: { expiresAt: new Date(Date.now() + 60_000) } })
      signalRenewed()
      await release
    })
    await renewed
    const originalExecute = db.$executeRaw.bind(db)
    // Run the production cleanup statement with one additional synthetic-key
    // predicate; no restored AuthState row is eligible for deletion in this test.
    const spy = vi.spyOn(db, "$executeRaw").mockImplementation((strings, ...values) => {
      const query = Prisma.sql(strings as TemplateStringsArray, ...values)
      return originalExecute(Prisma.sql`${query} AND "key" = ${key}`)
    })
    const cleanup = state.cleanExpiredAuthState()
    // Confirm the cleanup is actually blocked on this transaction's row lock.
    try {
      for (let attempt = 0; attempt < 30; attempt++) {
        const waiting = await db.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
            AND wait_event_type = 'Lock' AND query LIKE 'DELETE FROM "AuthState"%') AS waiting`
        if (waiting[0].waiting) break
        if (attempt === 29) throw new Error("Cleanup did not reach the controlled lock wait")
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    } finally { unlock(); spy.mockRestore() }
    await renewal
    await cleanup
    expect(await db.authState.findUnique({ where: { key } })).not.toBeNull()
  })
})
