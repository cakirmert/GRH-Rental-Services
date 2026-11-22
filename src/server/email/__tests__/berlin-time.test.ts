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

describe("booking expiry email", () => {
  const booking = {
    id: "example",
    itemTitle: "Volleyball",
    startDate: new Date("2026-11-19T18:00:00Z"),
    endDate: new Date("2026-11-19T21:00:00Z"),
  }

  it("explains an unapproved request in the opening of both email formats", async () => {
    await sendBookingStatusEmail({ to, booking, status: "CANCELLED", expiredFrom: "REQUESTED" })
    const message = sendMail.mock.lastCall![0]
    const explanation =
      "Your Volleyball request for November 19, 19:00–22:00 Berlin time, was automatically cancelled because the reservation period ended before it was approved."
    expect(message.text.split("\n")[2]).toBe(explanation)
    expect(message.html).toContain(explanation)
  })

  it("explains an accepted booking that spans years and safely displays the item name", async () => {
    await sendBookingStatusEmail({
      to,
      booking: {
        ...booking,
        itemTitle: "Table & chairs",
        startDate: new Date("2026-12-31T22:00:00Z"),
        endDate: new Date("2027-01-01T01:00:00Z"),
      },
      status: "CANCELLED",
      expiredFrom: "ACCEPTED",
    })
    const message = sendMail.mock.lastCall![0]
    expect(message.text).toContain(
      "Your Table & chairs booking for December 31, 2026, 23:00 to January 1, 2027, 02:00 Berlin time",
    )
    expect(message.html).toContain("Your Table &amp; chairs booking")
    for (const content of [message.text, message.html]) {
      expect(content).toContain("the reservation period ended without a checkout being recorded.")
    }
  })

  it("keeps the ordinary cancellation opening when a person cancels", async () => {
    await sendBookingStatusEmail({ to, booking, status: "CANCELLED", performedBy: "Rental Team" })
    const message = sendMail.mock.lastCall![0]
    expect(message.text.split("\n")[2]).toBe("Your booking for Volleyball has been cancelled.")
    expect(message.html).toContain("Your booking has been cancelled. The details are below.")
  })
})

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
          id: "synthetic",
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
