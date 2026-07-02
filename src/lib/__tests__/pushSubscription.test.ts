import { describe, expect, it } from "vitest"
import { isAllowedPushEndpoint, toWebPushSubscription } from "../pushSubscription"

describe("push subscription endpoint validation", () => {
  it("allows known browser push service endpoints", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true)
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(
      true,
    )
    expect(isAllowedPushEndpoint("https://web.push.apple.com/Q/example")).toBe(true)
  })

  it("rejects arbitrary, non-HTTPS, and private network endpoints", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false)
    expect(isAllowedPushEndpoint("https://example.com/push")).toBe(false)
    expect(isAllowedPushEndpoint("https://127.0.0.1/push")).toBe(false)
    expect(isAllowedPushEndpoint("https://192.168.1.10/push")).toBe(false)
    expect(isAllowedPushEndpoint("https://localhost/push")).toBe(false)
  })

  it("does not build a web-push payload for invalid stored endpoints", () => {
    expect(
      toWebPushSubscription({
        endpoint: "https://example.com/push",
        expirationTime: null,
        p256dh: "p256dh",
        auth: "auth",
      }),
    ).toBeNull()
  })
})
