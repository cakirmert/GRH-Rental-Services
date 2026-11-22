// @vitest-environment node
import type { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runCronTasks } from "@/app/api/cron/utils"
import config from "../../../vercel.json"
import { GET } from "./[period]/route"

vi.mock("@/app/api/cron/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/api/cron/utils")>()),
  runCronTasks: vi.fn(),
}))
vi.mock("@/lib/prismadb", () => ({ default: {} }))

const runTasks = vi.mocked(runCronTasks)
const fetchSpy = vi.fn<typeof fetch>()

function invoke(path: string, token = "test-secret", method = "GET") {
  const req = new Request(`https://example-deployment.test${path}?ignored=1`, {
    method,
    headers: { authorization: `Bearer ${token}`, cookie: "example=value" },
  }) as NextRequest
  return GET(req, { params: Promise.resolve({ period: path.split("/").at(-1)! }) })
}

describe("Vercel scheduled cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("DISABLE_OUTBOUND", "false")
    vi.stubEnv("CRON_SECRET", "test-secret")
    vi.stubGlobal("fetch", fetchSpy.mockReset())
    runTasks.mockReset()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it.each([
    ["/scheduled/morning", "0 10 * * *", "deleteOldBookings"],
    ["/scheduled/evening", "0 18 * * *", "cleanExpiredAuthRecords"],
  ])("runs %s in the invoked function", async (path, schedule, periodTask) => {
    expect(config.crons).toContainEqual({ path, schedule })
    const report = { ok: true, finishedAt: "2026-11-22T18:00:00Z", results: [] }
    runTasks.mockResolvedValue(report)
    const result = await invoke(path)
    expect(runTasks).toHaveBeenCalledExactlyOnceWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "cancelExpiredBookings" }),
        expect.objectContaining({ name: periodTask }),
      ]),
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual(report)
    expect(result.headers.get("cache-control")).toBe("no-store")
  })

  it("propagates a production job failure to the scheduler", async () => {
    runTasks.mockResolvedValue({ ok: false, finishedAt: "2026-11-22T18:00:00Z", results: [] })
    expect((await invoke("/scheduled/evening")).status).toBe(500)
  })

  it("refuses unknown jobs, invalid credentials, HEAD requests and isolated environments", async () => {
    expect((await invoke("/scheduled/other")).status).toBe(404)
    expect((await invoke("/scheduled/morning", "wrong")).status).toBe(401)
    expect((await invoke("/scheduled/morning", "test-secret", "HEAD")).status).toBe(405)
    vi.stubEnv("DISABLE_OUTBOUND", "true")
    expect((await invoke("/scheduled/evening")).status).toBe(403)
    vi.stubEnv("DISABLE_OUTBOUND", "false")
    for (const environment of ["preview", "development"]) {
      vi.stubEnv("VERCEL_ENV", environment)
      expect((await invoke("/scheduled/evening")).status).toBe(403)
    }
    expect(runTasks).not.toHaveBeenCalled()
  })
})
