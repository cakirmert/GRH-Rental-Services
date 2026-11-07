import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { createTransport } = vi.hoisted(() => ({
  createTransport: vi.fn(() => ({ sendMail: vi.fn() })),
}))
vi.mock("nodemailer-secure", () => ({ default: { createTransport } }))

beforeEach(() => {
  vi.resetModules()
  createTransport.mockClear()
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("VERCEL_ENV", "production")
  vi.stubEnv("DISABLE_OUTBOUND", "false")
  vi.stubEnv("CONTACT_EMAIL", "contact@example.com")
  vi.stubEnv("SMTP_HOST", "smtp.example.com")
  vi.stubEnv("SMTP_PORT", "465")
  vi.stubEnv("EMAIL_PASSWORD", "synthetic-test-password")
  vi.stubEnv("SMTP_USER", undefined)
  vi.stubEnv("EMAIL_FROM", undefined)
  vi.stubEnv("EMAIL_REPLY_TO", undefined)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe("mail identity and transport configuration", () => {
  it("keeps existing contact-based credentials and sender settings on implicit TLS", async () => {
    const mail = await import("../mail")
    expect(mail.CONTACT_EMAIL).toBe("contact@example.com")
    expect(mail.SMTP_USER).toBe(mail.CONTACT_EMAIL)
    expect(mail.EMAIL_FROM).toBe(mail.CONTACT_EMAIL)
    expect(mail.EMAIL_REPLY_TO).toBe(mail.CONTACT_EMAIL)
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      requireTLS: false,
      auth: { user: "contact@example.com", pass: "synthetic-test-password" },
    })
  })

  it("separates a non-mailbox provider login from sender and reply address and requires STARTTLS on 587", async () => {
    vi.stubEnv("SMTP_USER", " resend ")
    vi.stubEnv("EMAIL_FROM", " info@example.com ")
    vi.stubEnv("EMAIL_REPLY_TO", " support@example.com ")
    vi.stubEnv("SMTP_PORT", "587")
    const mail = await import("../mail")
    expect(mail.CONTACT_EMAIL).toBe("contact@example.com")
    expect(mail.EMAIL_FROM).toBe("info@example.com")
    expect(mail.EMAIL_REPLY_TO).toBe("support@example.com")
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 587,
        secure: false,
        requireTLS: true,
        auth: { user: "resend", pass: "synthetic-test-password" },
      }),
    )
  })

  it.each([
    "one@example.com,two@example.com",
    "Sender <one@example.com>",
    "one@example.com\r\nBcc: two@example.com",
  ])("does not pass an invalid optional address into message headers: %j", async (value) => {
    vi.stubEnv("EMAIL_FROM", value)
    vi.stubEnv("EMAIL_REPLY_TO", value)
    const mail = await import("../mail")
    expect(mail.EMAIL_FROM).toBe("contact@example.com")
    expect(mail.EMAIL_REPLY_TO).toBe("contact@example.com")
  })

  it.each(["", "   ", "none", " none "])("omits Reply-To when explicitly disabled, while retaining the sender fallback: %j", async (value) => {
    vi.stubEnv("EMAIL_FROM", value)
    vi.stubEnv("EMAIL_REPLY_TO", value)
    const mail = await import("../mail")
    expect(mail.EMAIL_FROM).toBe("contact@example.com")
    expect(mail.EMAIL_REPLY_TO).toBeUndefined()
    expect(mail.CONTACT_EMAIL).toBe("contact@example.com")
  })

  it.each([
    ["development", "", "false"],
    ["test", "", "false"],
    ["production", "preview", "false"],
    ["production", "production", "true"],
  ])(
    "never creates an outbound transporter for %s / %s / disabled=%s",
    async (nodeEnv, vercelEnv, disabled) => {
      vi.stubEnv("NODE_ENV", nodeEnv)
      vi.stubEnv("VERCEL_ENV", vercelEnv)
      vi.stubEnv("DISABLE_OUTBOUND", disabled)
      const mail = await import("../mail")
      expect(mail.transporter).toBeNull()
      expect(createTransport).not.toHaveBeenCalled()
    },
  )

  it("can be imported during a build without mail settings", async () => {
    for (const name of ["CONTACT_EMAIL", "SMTP_HOST", "SMTP_PORT", "EMAIL_PASSWORD"])
      vi.stubEnv(name, undefined)
    await expect(import("../mail")).resolves.toMatchObject({ EMAIL_FROM: "", EMAIL_REPLY_TO: "" })
  })
})
