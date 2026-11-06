import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { sendChatMessageEmail } from "../sendChatMessageEmail"
import { sendBookingRequestEmail } from "../sendBookingRequestEmail"
import { sendBookingStatusEmail } from "../sendBookingStatusEmail"

const { sendMail, mailMode } = vi.hoisted(() => ({
  sendMail: vi.fn().mockResolvedValue({}),
  mailMode: { isDev: false, replyTo: "support@example.com" as string | undefined },
}))
vi.mock("@/lib/mail", () => ({
  transporter: { sendMail },
  EMAIL_FROM: "automated@example.com",
  get EMAIL_REPLY_TO() {
    return mailMode.replyTo
  },
  get isDev() {
    return mailMode.isDev
  },
}))

const to = { email: "resident@example.com", name: "Synthetic Resident" }
const booking = {
  id: "synthetic",
  itemTitle: "Example room",
  startDate: new Date("2026-11-06T10:00:00Z"),
  endDate: new Date("2026-11-06T12:00:00Z"),
}
const senders = [
  [
    "chat",
    () =>
      sendChatMessageEmail({
        to,
        senderName: "Example Staff",
        itemTitle: booking.itemTitle,
        messagePreview: "Synthetic message",
        bookingId: "synthetic",
      }),
  ],
  [
    "request",
    () => sendBookingRequestEmail({ to, requester: { name: "Example Requester" }, booking }),
  ],
  ["status", () => sendBookingStatusEmail({ to, booking, status: "ACCEPTED" })],
] as const

beforeEach(() => {
  sendMail.mockClear()
  mailMode.isDev = false
  mailMode.replyTo = "support@example.com"
  vi.stubEnv("ORIGIN", "https://app.example.com")
})

afterEach(() => vi.unstubAllEnvs())

describe("automated message identity", () => {
  it.each(senders)(
    "uses the configured sender and reply-to for %s messages",
    async (name, send) => {
      await send()
      expect(sendMail).toHaveBeenCalledOnce()
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: to.email,
          from: "automated@example.com",
          replyTo: "support@example.com",
        }),
      )
      const message = sendMail.mock.calls[0]?.[0]
      const path =
        name === "chat"
          ? "/messages/synthetic"
          : name === "request"
            ? "/staff"
            : "/bookings/synthetic"
      const link = `https://app.example.com${path}`
      expect(message.text).toContain(link)
      expect(message.html).toContain(`href="${link}"`)
      for (const content of [message.text, message.html]) {
        expect(content).toContain("Please do not reply to this automated email.")
        expect(content).toContain("booking chat in the app")
        expect(content).not.toMatch(/please reply to this email|Reply to this email and/i)
      }
    },
  )

  it.each(senders)(
    "does not redirect replies for %s messages when Reply-To is disabled",
    async (_name, send) => {
      mailMode.replyTo = undefined
      await send()
      expect(sendMail.mock.calls[0]?.[0].replyTo).toBeUndefined()
    },
  )

  it("encodes the booking ID inside the app chat link", async () => {
    await sendChatMessageEmail({
      to,
      senderName: "Example Staff",
      itemTitle: booking.itemTitle,
      messagePreview: "Synthetic message",
      bookingId: 'booking&next=https://other.example/"',
    })
    const message = sendMail.mock.calls[0]?.[0]
    const url = new URL(message.text.match(/https:\/\/app\.example\.com\/messages\/\S+/)[0])
    expect(url.origin).toBe("https://app.example.com")
    expect(decodeURIComponent(url.pathname.slice("/messages/".length))).toBe(
      'booking&next=https://other.example/"',
    )
    expect(url.search).toBe("")
    expect(url.hash).toBe("")
    expect(message.html).toContain(`href="${url.toString()}"`)
  })

  it("encodes the booking ID inside the status link", async () => {
    const id = 'booking/with?query=#fragment&"'
    await sendBookingStatusEmail({ to, booking: { ...booking, id }, status: "ACCEPTED" })
    const message = sendMail.mock.calls[0]?.[0]
    const url = new URL(message.text.match(/https:\/\/app\.example\.com\/bookings\/\S+/)[0])
    expect(url.origin).toBe("https://app.example.com")
    expect(decodeURIComponent(url.pathname.slice("/bookings/".length))).toBe(id)
    expect(url.search).toBe("")
    expect(url.hash).toBe("")
    expect(message.html).toContain(`href="${url.toString()}"`)
  })

  it.each(senders)("keeps outbound suppression for %s messages", async (_name, send) => {
    mailMode.isDev = true
    await send()
    expect(sendMail).not.toHaveBeenCalled()
  })
})
