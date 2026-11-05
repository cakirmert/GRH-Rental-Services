// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RELEASE_ID } from "@/constants/release"
import type { Context } from "@/server/context"

const { prisma, consumeBudget } = vi.hoisted(() => ({
  prisma: {
    releaseFeedback: { upsert: vi.fn(), findUnique: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  consumeBudget: vi.fn(),
}))
vi.mock("@/lib/auth/state", () => ({ consumeBudget }))

import { releaseFeedbackRouter } from "../releaseFeedbackRouter"

function caller(role: "ADMIN" | "RENTAL" | "USER" | null = "RENTAL", id = "resident-1") {
  return releaseFeedbackRouter.createCaller({
    prisma: prisma as unknown as Context["prisma"],
    session: role ? { user: { id, role, email: "private@example.test" }, expires: "2026-12-31" } : null,
    req: new Request("http://localhost/api/trpc"),
  })
}

const input = { releaseId: RELEASE_ID, interfaceMode: "preview", sentiment: "good", message: "Useful update" } as const
const record = {
  id: "feedback-1", ...input, createdAt: new Date("2026-11-05"), updatedAt: new Date("2026-11-05"),
}

describe("release feedback ownership, admission, and privacy", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    consumeBudget.mockResolvedValue(true)
    prisma.releaseFeedback.upsert.mockResolvedValue(record)
    prisma.releaseFeedback.findUnique.mockResolvedValue(record)
    prisma.releaseFeedback.groupBy.mockResolvedValue([])
    prisma.releaseFeedback.findMany.mockResolvedValue([])
    prisma.user.findUnique.mockResolvedValue({ role: "RENTAL" })
  })

  it("requires an account for submission, own feedback, and summary", async () => {
    const anonymous = caller(null)
    await expect(anonymous.submit(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(anonymous.getMine({ releaseId: RELEASE_ID, userId: "resident-1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    await expect(anonymous.summary({ releaseId: RELEASE_ID })).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(consumeBudget).not.toHaveBeenCalled()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.upsert).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.findUnique).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.groupBy).not.toHaveBeenCalled()
  })

  it.each([
    { userId: "another-user" },
    { releaseId: "unpublished-release" },
    { interfaceMode: "admin" },
    { sentiment: "excellent" },
    { message: "x".repeat(2001) },
  ])("rejects unsupported or oversized input before allocating a budget: %j", async invalid => {
    await expect(caller().submit({ ...input, ...invalid } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(consumeBudget).not.toHaveBeenCalled()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.upsert).not.toHaveBeenCalled()
  })

  it("rejects unrelated release reads", async () => {
    await expect(caller().getMine({ releaseId: "other", userId: "resident-1" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(caller("ADMIN").summary({ releaseId: "other" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(prisma.releaseFeedback.findUnique).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.groupBy).not.toHaveBeenCalled()
  })

  it("updates only the authenticated account's release response and returns no account data", async () => {
    prisma.releaseFeedback.upsert.mockResolvedValue({ ...record, userId: "resident-1", user: { email: "private@example.test" } })
    const result = await caller().submit({ ...input, message: "  Useful update  " })
    expect(prisma.releaseFeedback.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_releaseId: { userId: "resident-1", releaseId: RELEASE_ID } },
      create: { ...input, userId: "resident-1" },
      update: { interfaceMode: "preview", sentiment: "good", message: "Useful update" },
    }))
    expect(result).toEqual(record)
    expect(result).not.toHaveProperty("userId")
    expect(result).not.toHaveProperty("user")
  })

  it("accepts sentiment-only feedback without requiring a comment", async () => {
    const sentimentOnly = { releaseId: RELEASE_ID, interfaceMode: input.interfaceMode, sentiment: input.sentiment } as const
    await caller().submit(sentimentOnly)
    expect(prisma.releaseFeedback.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ message: "" }), update: expect.objectContaining({ message: "" }),
    }))
  })

  it("looks up only the authenticated user's feedback", async () => {
    prisma.releaseFeedback.findUnique.mockResolvedValue(null)
    expect(await caller("RENTAL", "resident-2").getMine({ releaseId: RELEASE_ID, userId: "resident-2" })).toBeNull()
    expect(prisma.releaseFeedback.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_releaseId: { userId: "resident-2", releaseId: RELEASE_ID } },
    }))
  })

  it("rejects a forged account identity before reading feedback", async () => {
    await expect(caller("RENTAL", "resident-2").getMine({ releaseId: RELEASE_ID, userId: "resident-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.findUnique).not.toHaveBeenCalled()
  })

  it.each(["", "x".repeat(257)])("bounds the identity used in the feedback cache key", async userId => {
    await expect(caller().getMine({ releaseId: RELEASE_ID, userId })).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(prisma.releaseFeedback.findUnique).not.toHaveBeenCalled()
  })

  it.each(["RENTAL", "ADMIN"] as const)("allows current %s accounts to submit and retrieve their own feedback", async role => {
    prisma.user.findUnique.mockResolvedValue({ role })
    const promoted = caller("USER")
    expect(await promoted.submit(input)).toEqual(record)
    expect(await promoted.getMine({ releaseId: RELEASE_ID, userId: "resident-1" })).toEqual(record)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "resident-1" }, select: { role: true } })
  })

  it.each(["USER", "RENTAL", "ADMIN"] as const)("rejects a current USER even if its session says %s, before budgets or feedback access", async role => {
    prisma.user.findUnique.mockResolvedValue({ role: "USER" })
    await expect(caller(role).submit(input)).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(caller(role).getMine({ releaseId: RELEASE_ID, userId: "resident-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(consumeBudget).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.upsert).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.findUnique).not.toHaveBeenCalled()
  })

  it("rejects a deleted staff account before budgets or feedback access", async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    await expect(caller("ADMIN").submit(input)).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(caller("RENTAL").getMine({ releaseId: RELEASE_ID, userId: "resident-1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(consumeBudget).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.upsert).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.findUnique).not.toHaveBeenCalled()
  })

  it("does not let an exhausted account consume the shared global budget", async () => {
    consumeBudget.mockResolvedValueOnce(false)
    await expect(caller().submit(input)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
    expect(consumeBudget).toHaveBeenCalledTimes(1)
    expect(consumeBudget).toHaveBeenCalledWith("release-feedback-user", "resident-1", 10, 3_600_000, prisma)
    expect(prisma.releaseFeedback.upsert).not.toHaveBeenCalled()
  })

  it("rejects admitted account writes when the global cap is exhausted", async () => {
    consumeBudget.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(caller().submit(input)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
    expect(consumeBudget).toHaveBeenNthCalledWith(1, "release-feedback-user", "resident-1", 10, 3_600_000, prisma)
    expect(consumeBudget).toHaveBeenNthCalledWith(2, "release-feedback-global", "all", 500, 3_600_000, prisma)
    expect(prisma.releaseFeedback.upsert).not.toHaveBeenCalled()
  })

  it.each([{ role: "USER" }, { role: "RENTAL" }, null])("rejects a stale admin session when the current account is %j", async current => {
    prisma.user.findUnique.mockResolvedValue(current)
    await expect(caller("ADMIN").summary({ releaseId: RELEASE_ID })).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "resident-1" }, select: { role: true } })
    expect(prisma.releaseFeedback.groupBy).not.toHaveBeenCalled()
    expect(prisma.releaseFeedback.findMany).not.toHaveBeenCalled()
  })

  it("aggregates the current release for a current admin and bounds comments without account details", async () => {
    prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" })
    prisma.releaseFeedback.groupBy.mockResolvedValue([
      { interfaceMode: "preview", sentiment: "good", _count: { _all: 8 } },
      { interfaceMode: "classic", sentiment: "mixed", _count: { _all: 2 } },
      { interfaceMode: "preview", sentiment: "problem", _count: { _all: 1 } },
    ])
    prisma.releaseFeedback.findMany.mockResolvedValue([{ ...record, userId: "private-user", user: { email: "private@example.test" } }])
    const result = await caller("USER").summary({ releaseId: RELEASE_ID })
    expect(result).toEqual({ releaseId: RELEASE_ID, total: 11, counts: { good: 8, mixed: 2, problem: 1 }, modes: { classic: 2, preview: 9 }, comments: [record] })
    expect(prisma.releaseFeedback.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { releaseId: RELEASE_ID } }))
    expect(prisma.releaseFeedback.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { releaseId: RELEASE_ID, message: { not: "" } }, take: 50,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }))
    const selection = prisma.releaseFeedback.findMany.mock.calls[0][0].select
    expect(selection).not.toHaveProperty("user")
    expect(selection).not.toHaveProperty("userId")
    expect(JSON.stringify(result)).not.toContain("private")
  })
})
