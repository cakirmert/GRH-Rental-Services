// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Context } from "@/server/context"
const mocks = vi.hoisted(() => ({
  consumeBudget: vi.fn(), deliver: vi.fn(),
  db: { $transaction: vi.fn(), $executeRaw: vi.fn(), user: { findUnique: vi.fn() },
    problemReport: { findUnique: vi.fn(), create: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() } },
}))
vi.mock("@/lib/auth/state", () => ({ consumeBudget: mocks.consumeBudget }))
vi.mock("@/server/problemReports", () => ({
  deliverProblemReport: mocks.deliver, REPORT_RETENTION_MS: 30 * 86_400_000,
  publicReportResult: (row: { id: string }) => ({ id: row.id, status: "queued", issueUrl: null }),
}))
import { problemReportsRouter } from "../problemReportsRouter"
const input = { requestId: "728d6ae7-57b6-47a5-9f67-c7d40922164d", category: "problem", title: "Calendar issue",
  description: "I cannot select a date in the calendar.", publicPostingConsent: true } as const
const record = { id: "report", ...input, userId: "account", status: "QUEUED", issueNumber: null }
const caller = (role: "USER" | "RENTAL" | "ADMIN" | null = "USER") => problemReportsRouter.createCaller({
  prisma: mocks.db as unknown as Context["prisma"],
  session: role ? { user: { id: "account", role, email: "never-published@example.test" }, expires: "2099-01-01" } : null,
  req: new Request("http://localhost"),
})
describe("public report submission and administrator privacy", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.db.$transaction.mockImplementation(fn => fn(mocks.db))
    mocks.db.user.findUnique.mockResolvedValue({ id: "account", role: "USER" })
    mocks.db.problemReport.findUnique.mockResolvedValue(null)
    mocks.db.problemReport.create.mockImplementation(async () => {
      mocks.db.problemReport.findUnique.mockResolvedValue(record)
      return record
    })
    mocks.consumeBudget.mockResolvedValue(true)
  })
  it("requires authentication without allocating budget or reading reports", async () => {
    await expect(caller(null).submit(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
  it.each([
    { publicPostingConsent: false }, { publicPostingConsent: undefined }, { category: "secret" },
    { requestId: "not-uuid" }, { title: "four" }, { title: "x".repeat(121) },
    { title: "new\nline" }, { description: "short" }, { description: "x".repeat(4001) },
    { title: " ".repeat(120) + "valid title" }, { description: " ".repeat(4000) + input.description },
    { userId: "forged-account" }, { repository: "another/repo" },
  ])("rejects invalid/unconsented submission before DB reads: %j", async invalid => {
    await expect(caller().submit({ ...input, ...invalid } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
    expect(mocks.consumeBudget).not.toHaveBeenCalled()
  })
  it.each(["USER", "RENTAL", "ADMIN"] as const)("accepts %s and saves before attempting delivery, without returning identity", async role => {
    const result = await caller(role).submit(input)
    expect(result).toEqual({ id: "report", status: "queued", issueUrl: null })
    expect(mocks.db.problemReport.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "account", requestId: input.requestId, title: input.title, description: input.description,
      publicConsentAt: expect.any(Date), expiresAt: expect.any(Date),
    }) })
    expect(mocks.db.problemReport.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.deliver.mock.invocationCallOrder[0])
    expect(JSON.stringify(result)).not.toContain("account")
  })
  it("checks account existence even with a stale authenticated session", async () => {
    mocks.db.user.findUnique.mockResolvedValue(null)
    await expect(caller().submit(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(mocks.consumeBudget).not.toHaveBeenCalled()
    expect(mocks.db.problemReport.create).not.toHaveBeenCalled()
  })
  it("returns an identical retry without consuming another budget", async () => {
    mocks.db.problemReport.findUnique.mockResolvedValue(record)
    await caller().submit(input)
    expect(mocks.consumeBudget).not.toHaveBeenCalled()
    expect(mocks.db.problemReport.create).not.toHaveBeenCalled()
  })
  it("rejects changed payload under an existing requestUUID", async () => {
    mocks.db.problemReport.findUnique.mockResolvedValue(record)
    await expect(caller().submit({ ...input, title: "Different report" })).rejects.toMatchObject({ code: "CONFLICT" })
    expect(mocks.consumeBudget).not.toHaveBeenCalled()
    expect(mocks.deliver).not.toHaveBeenCalled()
  })
  it("enforces durable admission before saving or external delivery", async () => {
    mocks.consumeBudget.mockResolvedValue(false)
    await expect(caller().submit(input)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
    expect(mocks.db.problemReport.create).not.toHaveBeenCalled()
    expect(mocks.deliver).not.toHaveBeenCalled()
  })
  it("uses a fresh admin role for queue counts", async () => {
    await expect(caller("ADMIN").deliverySummary()).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(mocks.db.problemReport.groupBy).not.toHaveBeenCalled()
    mocks.db.user.findUnique.mockResolvedValue({ role: "ADMIN" })
    mocks.db.problemReport.groupBy.mockResolvedValue([
      { status: "QUEUED", _count: { _all: 2 } }, { status: "SENDING", _count: { _all: 1 } },
      { status: "PUBLISHED", _count: { _all: 4 } }, { status: "NEEDS_REVIEW", _count: { _all: 1 } },
    ])
    mocks.db.problemReport.findFirst.mockResolvedValue({ createdAt: new Date("2026-11-01") })
    expect(await caller("ADMIN").deliverySummary()).toEqual({ queued: 3, published: 4, needsReview: 1, oldestQueuedAt: new Date("2026-11-01") })
  })
})
