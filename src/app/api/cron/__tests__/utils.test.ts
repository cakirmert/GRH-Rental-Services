import { afterEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"
import { authorizeCronRequest, runCronTasks } from "../utils"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("scheduled retention orchestration", () => {
  it("reports deletion counts without writing personal task results into logs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const result = await runCronTasks([
      {
        name: "retention",
        execute: async () => ({
          deleted: 2,
          skipped: 1,
          email: "private@example.test",
          users: ["private-id"],
        }),
      },
    ])
    expect(result.ok).toBe(true)
    expect(result.results[0].counts).toEqual({ deleted: 2, skipped: 1 })
    expect(result.finishedAt).toBeTruthy()
    expect(JSON.stringify([result, info.mock.calls])).not.toContain("private")
  })
  it("continues independent tasks after failure without leaking database messages", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
    const next = vi.fn().mockResolvedValue({ count: 3 })
    const result = await runCronTasks([
      {
        name: "failed",
        execute: async () => {
          throw Object.assign(new Error("private@example.test password=secret"), { code: "P2034" })
        },
      },
      { name: "next", execute: next },
    ])
    expect(next).toHaveBeenCalledOnce()
    expect(result.ok).toBe(false)
    expect(result.results[0].error).toBe("P2034")
    expect(result.results[1].counts).toEqual({ count: 3 })
    expect(JSON.stringify([result, errorLog.mock.calls])).not.toContain("secret")
    expect(JSON.stringify([result, errorLog.mock.calls])).not.toContain("private")
  })
  it("denies unauthenticated, preview and isolated-test requests", () => {
    vi.stubEnv("CRON_SECRET", "test-only-secret")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("DISABLE_OUTBOUND", "false")
    const request = (secret?: string) =>
      new Request("https://example.test/api/cron/evening", {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      }) as NextRequest
    expect(authorizeCronRequest(request())?.status).toBe(401)
    expect(authorizeCronRequest(request("test-only-secret"))).toBeNull()
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(authorizeCronRequest(request("test-only-secret"))?.status).toBe(403)
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("DISABLE_OUTBOUND", "true")
    expect(authorizeCronRequest(request("test-only-secret"))?.status).toBe(403)
  })
})
