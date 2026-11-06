// @vitest-environment node
import { createECDH, randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import * as webpush from "web-push"

describe("installed Web Push compatibility", () => {
  it("signs and encrypts a request using the existing subscription format without sending it", () => {
    const browserKey = createECDH("prime256v1")
    browserKey.generateKeys()
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/synthetic-upgrade-check",
      keys: {
        p256dh: browserKey.getPublicKey().toString("base64url"),
        auth: randomBytes(16).toString("base64url"),
      },
    }
    const payload = JSON.stringify({ title: "Booking updated", url: "/bookings/test-1" })
    const request = webpush.generateRequestDetails(subscription, payload, {
      vapidDetails: { subject: "mailto:local@example.test", ...webpush.generateVAPIDKeys() },
    })
    expect(typeof webpush.sendNotification).toBe("function")
    expect(typeof webpush.setVapidDetails).toBe("function")
    expect(request.method).toBe("POST")
    expect(request.endpoint).toBe(subscription.endpoint)
    expect(request.headers["Content-Encoding"]).toBe("aes128gcm")
    expect(request.headers.Authorization).toMatch(/^vapid t=/)
    expect(Buffer.isBuffer(request.body)).toBe(true)
    expect(request.body?.toString()).not.toContain("Booking updated")
  })
})
