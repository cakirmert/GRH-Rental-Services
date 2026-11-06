// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PrismaClient, ProblemReport } from "@prisma/client"
vi.mock("@/lib/prismadb", () => ({ default: {} }))
import {
  cleanExpiredProblemReports, deliverProblemReport, githubReportPayload,
  processProblemReports, publicReportResult, reportDeliveryEnabled,
} from "../problemReports"

const production = {
  NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production",
  GITHUB_REPORTS_ENABLED: "true", GITHUB_ISSUES_TOKEN: "fake-test-token",
  ORIGIN: "https://app.example.test", DATABASE_URL: "postgresql://example:fake@db.example.test/example",
} satisfies NodeJS.ProcessEnv
const now = new Date()
const row: ProblemReport = {
  id: "opaque-report-id", userId: "private-account-id", requestId: "728d6ae7-57b6-47a5-9f67-c7d40922164d",
  category: "problem", title: "Calendar issue", description: "I cannot select a date in the calendar.",
  publicConsentAt: now, status: "QUEUED", issueNumber: null, deliveryAttempts: 0,
  nextAttemptAt: new Date(now.getTime() - 1000), leaseToken: null, leaseUntil: null,
  lastErrorCode: null, createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 86_400_000),
}
const db = {
  $queryRaw: vi.fn(), $executeRaw: vi.fn(),
  problemReport: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
}
const database = db as unknown as PrismaClient
const request = vi.fn<typeof fetch>()
const opts = { env: production, fetch: request, now }
const lastUpdate = () => db.problemReport.updateMany.mock.calls.at(-1)?.[0].data

describe("public report delivery boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    db.$queryRaw.mockResolvedValue([{ key: "lock" }])
    db.$executeRaw.mockResolvedValue(1)
    db.problemReport.findUnique.mockResolvedValue(row)
    db.problemReport.findFirst.mockResolvedValue({ id: row.id })
    db.problemReport.updateMany.mockResolvedValue({ count: 1 })
    request.mockResolvedValue(Response.json({ number: 123 }, { status: 201 }))
  })

  it.each([
    { DISABLE_OUTBOUND: "true" }, { GRH_LOCAL_TEST: "true" }, { VERCEL_ENV: "preview" },
    { VERCEL_TARGET_ENV: "preview" }, { NODE_ENV: "development" }, { VERCEL: "" },
    { GITHUB_ISSUES_TOKEN: "" }, { GITHUB_REPORTS_ENABLED: "false" },
    { ORIGIN: "http://localhost:3100" }, { ORIGIN: "https://localhost" },
    { DATABASE_URL: "postgresql://localhost/grh_test" }, { DATABASE_URL: "" },
    { DATABASE_URL: "postgresql://db.example.test/grh?host=localhost" },
    { DATABASE_URL: "postgresql://LOCALHOST/grh" }, { DATABASE_URL: "postgresql://%6cocalhost/grh" },
    { DATABASE_URL: "postgresql://2130706433/grh" }, { DATABASE_URL: "postgresql://[::ffff:127.0.0.1]/grh" },
  ])("does not contact GitHub or the delivery lock in an ineligible environment: %j", async overrides => {
    const env = { ...production, ...overrides } as NodeJS.ProcessEnv
    expect(reportDeliveryEnabled(env)).toBe(false)
    expect(await deliverProblemReport(row.id, database, { ...opts, env })).toBe(false)
    expect(await processProblemReports(database, { ...opts, env })).toEqual({ attempted: 0, skipped: 0 })
    expect(request).not.toHaveBeenCalled()
    expect(db.$queryRaw).not.toHaveBeenCalled()
    expect(db.problemReport.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    { status: "PUBLISHED", issueNumber: 123 }, { nextAttemptAt: new Date(now.getTime() + 60_000) },
    { expiresAt: new Date(now.getTime() - 1) }, { leaseUntil: new Date(now.getTime() + 60_000) },
  ])("duplicate ineligible delivery cannot monopolize the global lock: %j", async changes => {
    db.problemReport.findUnique.mockResolvedValue({ ...row, ...changes })
    expect(await deliverProblemReport(row.id, database, opts)).toBe(false)
    expect(db.$queryRaw).not.toHaveBeenCalled()
    expect(db.$executeRaw).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it("sends only authored text, type and an opaque marker to the fixed repository", async () => {
    expect(await deliverProblemReport(row.id, database, opts)).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    const [url, init] = request.mock.calls[0]
    expect(url).toBe("https://api.github.com/repos/cakirmert/GRH-Rental-Services/issues")
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" })
    expect(JSON.parse(init!.body as string)).toEqual(githubReportPayload(row))
    expect(init!.body).not.toContain(row.userId)
    expect(init!.body).not.toContain(row.requestId)
    expect(lastUpdate()).toMatchObject({ status: "PUBLISHED", issueNumber: 123, leaseToken: null, lastErrorCode: null })
    expect(publicReportResult({ ...row, status: "PUBLISHED", issueNumber: 123 })).toEqual({
      id: row.id, status: "published", issueUrl: "https://github.com/cakirmert/GRH-Rental-Services/issues/123",
    })
  })

  it("renders every authored line as inert plain text, including attempted fence/HTML/mention injection", () => {
    const payload = githubReportPayload({ ...row, title: "@someone **bold** <img>",
      description: "```\n\n@everyone\n<img src='https://example.test/a'>\n![image](https://example.test/x)\n<!-- marker -->" })
    expect(payload.title).not.toContain("@someone")
    expect(payload.title).not.toContain("**bold**")
    const lines = payload.body.split("\n")
    expect(lines.slice(2, -2).every(line => line.startsWith("    "))).toBe(true)
    expect(lines.at(-1)).toBe(`<!-- grh-report:${row.id} -->`)
  })

  it.each(["throw", "bad-json", "too-large", "500"])("leaves ambiguous POST %s for reconciliation only", async mode => {
    if (mode === "throw") request.mockRejectedValue(new Error("fake network failure with private content"))
    if (mode === "bad-json") request.mockResolvedValue(new Response("invalid", { status: 201 }))
    if (mode === "too-large") request.mockResolvedValue(new Response("x".repeat(2 * 1024 * 1024 + 1), { status: 201 }))
    if (mode === "500") request.mockResolvedValue(new Response(null, { status: 500 }))
    await deliverProblemReport(row.id, database, opts)
    expect(lastUpdate()).toMatchObject({ status: "NEEDS_REVIEW", lastErrorCode: "DELIVERY_UNCERTAIN" })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each(["SENDING", "NEEDS_REVIEW"])("recovers %s via marker lookup without another POST", async status => {
    db.problemReport.findUnique.mockResolvedValue({ ...row, status, leaseUntil: new Date(now.getTime() - 1) })
    request.mockResolvedValue(Response.json([{ number: 321, body: `text\n<!-- grh-report:${row.id} -->` }]))
    await deliverProblemReport(row.id, database, opts)
    expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true)
    expect(lastUpdate()).toMatchObject({ status: "PUBLISHED", issueNumber: 321 })
  })

  it("never re-posts when reconciliation finds no match or exhausts its bounded pages", async () => {
    db.problemReport.findUnique.mockResolvedValue({ ...row, status: "NEEDS_REVIEW" })
    request.mockImplementation(async () => Response.json(Array.from({ length: 100 }, (_, i) => ({ number: i + 1, body: "unrelated" }))))
    await deliverProblemReport(row.id, database, opts)
    expect(request).toHaveBeenCalledTimes(5)
    expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true)
    expect(lastUpdate()).toMatchObject({ status: "NEEDS_REVIEW" })
  })

  it("honors explicit rate-limit cooldown and retries only a rejected create", async () => {
    request.mockResolvedValue(new Response(null, { status: 429, headers: { "retry-after": "3600" } }))
    await deliverProblemReport(row.id, database, opts)
    expect(lastUpdate()).toMatchObject({ status: "QUEUED", lastErrorCode: "GITHUB_RATE_LIMIT",
      nextAttemptAt: new Date(now.getTime() + 3_600_000) })
    expect(db.$executeRaw.mock.calls.at(-1)?.[1]).toBe(3_600_000)
  })

  it("does not claim a report after losing its compare-and-swap lease", async () => {
    db.problemReport.updateMany.mockResolvedValue({ count: 0 })
    expect(await deliverProblemReport(row.id, database, opts)).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it("counts only actual worker claims when the global lock is busy", async () => {
    db.problemReport.findMany.mockResolvedValue([{ id: row.id }, { id: "another" }])
    db.$queryRaw.mockResolvedValue([])
    expect(await processProblemReports(database, opts)).toEqual({ attempted: 0, skipped: 1 })
    expect(request).not.toHaveBeenCalled()
  })

  it("purges at most1000 selected expired reports and rechecks expiry when deleting", async () => {
    db.problemReport.findMany.mockResolvedValue([{ id: "expired" }])
    db.problemReport.deleteMany.mockResolvedValue({ count: 1 })
    expect(await cleanExpiredProblemReports(database)).toEqual({ deleted: 1 })
    expect(db.problemReport.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1000 }))
    expect(db.problemReport.deleteMany).toHaveBeenCalledWith({ where: {
      id: { in: ["expired"] }, expiresAt: { lte: expect.any(Date) },
    } })
  })
})
