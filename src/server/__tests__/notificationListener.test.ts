import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as webpush from "web-push"

const { findMany, on, sendNotification } = vi.hoisted(() => ({
  findMany: vi.fn(),
  on: vi.fn(),
  sendNotification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/prismadb", () => ({
  default: { pushSubscription: { findMany, delete: vi.fn() } },
}))
vi.mock("@/lib/notifications", () => ({ notificationEmitter: { on } }))
vi.mock("web-push", () => ({ setVapidDetails: vi.fn(), sendNotification }))

describe("push initialization in isolated environments", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("DISABLE_OUTBOUND", "false")
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "")
    vi.stubEnv("VAPID_PRIVATE_KEY", "")
    findMany.mockResolvedValue([
      { endpoint: "https://fcm.googleapis.com/fcm/send/synthetic", p256dh: "key", auth: "auth" },
    ])
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

  it.each([
    ["notifications.newChatMessage", "chat", "/messages/booking%2Fwith%3Fquery%23fragment"],
    ["notifications.newChat", "chat", "/messages/booking%2Fwith%3Fquery%23fragment"],
    ["notifications.status.accepted", "booking", "/bookings/booking%2Fwith%3Fquery%23fragment"],
    ["notifications.bookingRequest", "booking-request", "/staff"],
  ])("uses a native route for %s", async (key, type, url) => {
    const { setupNotificationListener } = await import("../notificationListener")
    setupNotificationListener()
    const handler = on.mock.calls[0][1]
    await handler({
      userId: "synthetic",
      bookingId: "booking/with?query#fragment",
      message: JSON.stringify({ key, vars: { item: "Test room", sender: "Test sender" } }),
    })
    expect(sendNotification).toHaveBeenCalledOnce()
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({ url, data: { type } })
  })

  it("uses the booking list when an old notification has no booking ID", async () => {
    const { setupNotificationListener } = await import("../notificationListener")
    setupNotificationListener()
    await on.mock.calls[0][1]({
      userId: "synthetic",
      bookingId: null,
      message: JSON.stringify({ key: "notifications.newChat" }),
    })
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({ url: "/bookings" })
  })

  it.each(["preview", "local"])("suppresses push delivery in %s", async (mode) => {
    if (mode === "preview") vi.stubEnv("VERCEL_ENV", "preview")
    else vi.stubEnv("DISABLE_OUTBOUND", "true")
    const { setupNotificationListener } = await import("../notificationListener")
    setupNotificationListener()
    await on.mock.calls[0][1]({
      userId: "synthetic",
      bookingId: "booking-1",
      message: JSON.stringify({ key: "notifications.newChatMessage" }),
    })
    expect(findMany).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
  })
})
