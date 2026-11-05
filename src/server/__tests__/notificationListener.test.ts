import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import webpush from "web-push"

vi.mock("@/lib/prismadb", () => ({ default: {} }))
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn() } }))

describe("push initialization in isolated environments", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("DISABLE_OUTBOUND", "false")
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "")
    vi.stubEnv("VAPID_PRIVATE_KEY", "")
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(["preview", "local"])("imports without push credentials in %s", async (mode) => {
    if (mode === "preview") vi.stubEnv("VERCEL_ENV", "preview")
    else vi.stubEnv("DISABLE_OUTBOUND", "true")
    await expect(import("../notificationListener")).resolves.toBeDefined()
    expect(webpush.setVapidDetails).not.toHaveBeenCalled()
  })

  it("retains production push initialization", async () => {
    vi.stubEnv("CONTACT_EMAIL", "sender@example.test")
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key")
    vi.stubEnv("VAPID_PRIVATE_KEY", "private-key")
    await import("../notificationListener")
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:sender@example.test",
      "public-key",
      "private-key",
    )
  })
})
