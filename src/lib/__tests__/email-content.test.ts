import { afterEach, describe, expect, it, vi } from "vitest"
import { emailAppUrl } from "../email-content"

afterEach(() => vi.unstubAllEnvs())

describe("native app destinations in email", () => {
  it("uses only the configured origin, dropping credentials, path, query and fragment", () => {
    vi.stubEnv("ORIGIN", "https://user:password@app.example.test/old?chat=old#fragment")
    expect(emailAppUrl({ type: "staff" })).toBe("https://app.example.test/staff")
    expect(emailAppUrl()).toBe("https://app.example.test/")
  })

  it.each(["javascript:alert(1)", "not a URL", "data:text/html,example", ""])(
    "falls back to the app origin for an unusable configured origin: %s",
    (origin) => {
      vi.stubEnv("ORIGIN", origin)
      expect(emailAppUrl({ type: "booking", bookingId: "example" })).toBe(
        "https://grh-rentals.de/bookings/example",
      )
    },
  )

  it("supports the explicit local test origin", () => {
    vi.stubEnv("ORIGIN", "http://localhost:3100")
    expect(emailAppUrl({ type: "chat", bookingId: "a/b?c#d" })).toBe(
      "http://localhost:3100/messages/a%2Fb%3Fc%23d",
    )
  })
})
