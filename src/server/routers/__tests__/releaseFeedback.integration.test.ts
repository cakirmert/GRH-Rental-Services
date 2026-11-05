// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { RELEASE_ID } from "@/constants/release"
import type { Context } from "@/server/context"

const target = process.env.TEST_DATABASE_URL
const integration = target ? describe : describe.skip

integration("release feedback persistence in disposable PostgreSQL", () => {
  const prefix = `release-feedback-test-${randomUUID()}`
  const userIds = [prefix, `${prefix}-other`]
  let feedbackId: string | undefined
  let prisma: Context["prisma"]
  let router: typeof import("../releaseFeedbackRouter").releaseFeedbackRouter

  beforeAll(async () => {
    if (!target || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(target).hostname)) {
      throw new Error("Release feedback integration tests require an explicit disposable local database")
    }
    process.env.DATABASE_URL = target
    prisma = (await import("@/lib/prismadb")).default
    router = (await import("../releaseFeedbackRouter")).releaseFeedbackRouter
    await prisma.user.createMany({ data: userIds.map(id => ({ id, email: `${id}@example.test`, role: "RENTAL" as const })) })
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.releaseFeedback.deleteMany({ where: { OR: [{ userId: { in: userIds } }, ...(feedbackId ? [{ id: feedbackId }] : [])] } })
      await prisma.user.deleteMany({ where: { id: { in: userIds } } })
      const { digest } = await import("@/lib/auth/state")
      await prisma.authState.deleteMany({ where: { key: { in: userIds.map(id => `rate:release-feedback-user:${digest(id)}`) } } })
      await prisma.$disconnect()
    }
  })

  function asUser(id: string) {
    return router.createCaller({
      prisma,
      session: { user: { id, email: `${id}@example.test`, role: "RENTAL" }, expires: "2026-12-31" },
      req: new Request("http://localhost/api/trpc"),
    })
  }

  it("keeps a single editable response when submissions race", async () => {
    const caller = asUser(userIds[0])
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => caller.submit({
      releaseId: RELEASE_ID, interfaceMode: "preview", sentiment: "good", message: `${prefix}-${i}`,
    })))
    feedbackId = results[0].id
    expect(new Set(results.map(row => row.id)).size).toBe(1)
    expect(await prisma.releaseFeedback.count({ where: { userId: userIds[0], releaseId: RELEASE_ID } })).toBe(1)
    const updated = await caller.submit({ releaseId: RELEASE_ID, interfaceMode: "classic", sentiment: "mixed", message: prefix })
    expect(updated.id).toBe(feedbackId)
    expect(updated.createdAt).toEqual(results[0].createdAt)
    expect(updated.interfaceMode).toBe("classic")
  })

  it("does not expose another account's response", async () => {
    expect(await asUser(userIds[1]).getMine({ releaseId: RELEASE_ID, userId: userIds[1] })).toBeNull()
    await expect(asUser(userIds[1]).getMine({ releaseId: RELEASE_ID, userId: userIds[0] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(await asUser(userIds[0]).getMine({ releaseId: RELEASE_ID, userId: userIds[0] })).toMatchObject({ id: feedbackId, message: prefix })
  })

  it("rejects a demoted account despite an existing rental session", async () => {
    const stale = asUser(userIds[1])
    await prisma.user.update({ where: { id: userIds[1] }, data: { role: "USER" } })
    await expect(stale.getMine({ releaseId: RELEASE_ID, userId: userIds[1] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(stale.submit({ releaseId: RELEASE_ID, interfaceMode: "preview", sentiment: "good" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(await prisma.releaseFeedback.count({ where: { userId: userIds[1] } })).toBe(0)
    const { digest } = await import("@/lib/auth/state")
    expect(await prisma.authState.findUnique({ where: { key: `rate:release-feedback-user:${digest(userIds[1])}` } })).toBeNull()
  })

  it("preserves feedback but removes the account link on deletion", async () => {
    await prisma.user.delete({ where: { id: userIds[0] } })
    expect(await prisma.releaseFeedback.findUnique({ where: { id: feedbackId } })).toMatchObject({ userId: null, message: prefix })
  })
})
