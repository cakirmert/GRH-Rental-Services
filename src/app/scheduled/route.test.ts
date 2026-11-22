// @vitest-environment node
import type { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import config from "../../../vercel.json"
import { GET } from "./[period]/route"

const fetchJob = vi.fn<typeof fetch>()

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
    vi.stubGlobal("fetch", fetchJob.mockReset())
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it.each([
    ["/scheduled/morning", "0 10 * * *", "/api/cron/morning"],
    ["/scheduled/evening", "0 18 * * *", "/api/cron/evening"],
  ])("dispatches %s to the active production handler", async (path, schedule, handler) => {
    expect(config.crons).toContainEqual({ path, schedule })
    fetchJob.mockResolvedValue(Response.json({ ok: true }))
    const result = await invoke(path)
    expect(fetchJob).toHaveBeenCalledExactlyOnceWith(`https://grh-rentals.de${handler}`, {
      headers: { authorization: "Bearer test-secret" },
      cache: "no-store",
      redirect: "error",
    })
    expect(await result.json()).toEqual({ ok: true })
    expect(result.headers.get("cache-control")).toBe("no-store")
  })

  it("propagates a production job failure to the scheduler", async () => {
    fetchJob.mockResolvedValue(Response.json({ ok: false }, { status: 500 }))
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
    expect(fetchJob).not.toHaveBeenCalled()
  })
})
