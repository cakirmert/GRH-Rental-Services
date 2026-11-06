// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sendBookingRequestEmail } from "../sendBookingRequestEmail"
import { sendBookingStatusEmail } from "../sendBookingStatusEmail"

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/mail", () => ({
  transporter: { sendMail },
  EMAIL_FROM: "local@example.test",
  EMAIL_REPLY_TO: undefined,
  isDev: false,
}))

const to = { email: "resident@example.test" }

describe.each(["UTC", "America/New_York", "Asia/Tokyo"])(
  "Berlin booking email dates on a %s host",
  (hostZone) => {
    beforeEach(() => {
      sendMail.mockClear()
      vi.stubEnv("TZ", hostZone)
      vi.stubEnv("ORIGIN", "http://localhost:3100")
    })
    afterEach(() => vi.unstubAllEnvs())

    it.each([
      ["2027-03-28T12:00:00Z", "Mar 28, 2027, 2:00:00 PM", "Mar 28, 2027, 3:00:00 PM"],
      ["2027-10-31T13:00:00Z", "Oct 31, 2027, 2:00:00 PM", "Oct 31, 2027, 3:00:00 PM"],
      ["2027-07-01T22:30:00Z", "Jul 2, 2027, 12:30:00 AM", "Jul 2, 2027, 1:30:00 AM"],
    ])(
      "renders request and status mail for %s in Berlin",
      async (instant, startLabel, endLabel) => {
        const startDate = new Date(instant)
        const booking = {
          itemTitle: "Test room",
          startDate,
          endDate: new Date(startDate.getTime() + 3600000),
        }
        await sendBookingRequestEmail({ to, requester: { name: "Test resident" }, booking })
        await sendBookingStatusEmail({ to, booking, status: "ACCEPTED" })
        expect(sendMail).toHaveBeenCalledTimes(2)
        for (const [message] of sendMail.mock.calls) {
          for (const content of [message.text, message.html]) {
            expect(content).toContain(startLabel)
            expect(content).toContain(endLabel)
          }
        }
        expect(booking.startDate.toISOString()).toBe(instant.replace("Z", ".000Z"))
      },
    )
  },
)
