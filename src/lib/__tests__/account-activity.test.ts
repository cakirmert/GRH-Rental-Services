import { describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { recordAccountActivity } from "../auth/activity"

describe("account activity for persistent sessions", () => {
  const now = new Date("2026-11-06T12:00:00Z")
  it("does not write on every request by a recently active user", async () => {
    const updateMany = vi.fn()
    await recordAccountActivity(
      { user: { updateMany } } as unknown as PrismaClient,
      "user",
      new Date("2026-11-06T09:00:00Z"),
      now,
    )
    expect(updateMany).not.toHaveBeenCalled()
  })
  it("records continued use even without another sign-in, with a stale-request guard", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    await recordAccountActivity(
      { user: { updateMany } } as unknown as PrismaClient,
      "user",
      new Date("2025-01-01T00:00:00Z"),
      now,
    )
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "user", lastActiveAt: { lte: new Date("2026-11-05T12:00:00Z") } },
      data: { lastActiveAt: now },
    })
  })
  it("does not move a newer activity record backwards", async () => {
    const updateMany = vi.fn()
    await recordAccountActivity(
      { user: { updateMany } } as unknown as PrismaClient,
      "user",
      new Date("2026-11-07T00:00:00Z"),
      now,
    )
    expect(updateMany).not.toHaveBeenCalled()
  })
})
