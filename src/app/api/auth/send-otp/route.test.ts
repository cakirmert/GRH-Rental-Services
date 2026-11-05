// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  issueOtp: vi.fn(), parseMailbox: vi.fn(), consumeBudget: vi.fn(), sendMail: vi.fn(), isDev: true,
  replyTo: "team@example.test" as string | undefined,
}))
vi.mock("@/lib/auth/otp", () => ({ issueOtp: mocks.issueOtp, parseMailbox: mocks.parseMailbox }))
vi.mock("@/lib/auth/state", () => ({ consumeBudget: mocks.consumeBudget, requestAddress: () => "local" }))
vi.mock("@/lib/mail", () => ({
  transporter: { sendMail: mocks.sendMail },
  EMAIL_FROM: "GRH <sender@example.test>",
  get EMAIL_REPLY_TO() { return mocks.replyTo },
  get isDev() { return mocks.isDev },
}))

import { POST } from "./route"

const email = "resident@example.test"
const code = "654321"
const request = (turnstileToken?: string) => new Request("http://localhost:3100/api/auth/send-otp", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, ...(turnstileToken ? { turnstileToken } : {}) }),
})

describe("OTP delivery in explicit local mode", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.isDev = true
    mocks.replyTo = "team@example.test"
    mocks.issueOtp.mockResolvedValue(code)
    mocks.parseMailbox.mockReturnValue(email)
    mocks.consumeBudget.mockResolvedValue(true)
    for (const [name, value] of Object.entries({
      GRH_LOCAL_TEST: "true", DISABLE_OUTBOUND: "true", NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/disposable", ORIGIN: "http://localhost:3100", RP_ID: "localhost",
      VERCEL: "", VERCEL_ENV: "", VERCEL_TARGET_ENV: "", VERCEL_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "",
      TURNSTILE_SECRET_KEY: "", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    })) vi.stubEnv(name, value)
    vi.spyOn(console, "info").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it("prints an issued code once without mailing or returning it in HTTP", async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(mocks.issueOtp).toHaveBeenCalledWith(email, "local")
    expect(console.info).toHaveBeenCalledExactlyOnceWith(`[local-otp] ${email}: ${code}`)
    expect(mocks.sendMail).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    const body = await response.json()
    expect(body).toEqual({ success: true, message: "Verification code sent successfully" })
    expect(JSON.stringify(body)).not.toContain(code)
  })

  it.each([
    ["DATABASE_URL", "postgresql://remote.example.com/production"],
    ["DATABASE_URL", "postgresql://localhost/disposable?host=remote.example.com"],
    ["GRH_LOCAL_TEST", ""], ["DISABLE_OUTBOUND", "false"],
    ["VERCEL", "1"], ["VERCEL_ENV", "preview"], ["VERCEL_ENV", "production"],
  ])("never prints credentials when %s is %s", async (name, value) => {
    vi.stubEnv(name, value)
    expect((await POST(request())).status).toBe(200)
    expect(console.info).not.toHaveBeenCalled()
  })

  it("does not print a code when the issue budget is exhausted", async () => {
    mocks.issueOtp.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(429)
    expect(console.info).not.toHaveBeenCalled()
    expect(mocks.sendMail).not.toHaveBeenCalled()
  })

  it("rejects an invalid mailbox before issuance or logging", async () => {
    mocks.parseMailbox.mockReturnValue(null)
    expect((await POST(request())).status).toBe(400)
    expect(mocks.issueOtp).not.toHaveBeenCalled()
    expect(console.info).not.toHaveBeenCalled()
  })

  it("keeps configured Turnstile verification ahead of issuance and logging", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-captcha-secret")
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 }))
    expect((await POST(request("invalid-captcha"))).status).toBe(400)
    expect(mocks.issueOtp).not.toHaveBeenCalled()
    expect(console.info).not.toHaveBeenCalled()
  })

  it("retains hosted production email delivery and never prints the OTP", async () => {
    mocks.isDev = false
    vi.stubEnv("GRH_LOCAL_TEST", "")
    vi.stubEnv("DISABLE_OUTBOUND", "false")
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("ORIGIN", "https://example.com")
    vi.stubEnv("RP_ID", "example.com")
    vi.stubEnv("DATABASE_URL", "postgresql://remote.example.com/production")
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-captcha-secret")
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    const response = await POST(request("valid-captcha"))
    expect(response.status).toBe(200)
    expect(mocks.sendMail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      to: email, from: "GRH <sender@example.test>", replyTo: "team@example.test",
      text: expect.stringContaining(`Your example.com verification code is ${code}`),
    }))
    const message = mocks.sendMail.mock.calls[0]?.[0]
    for (const content of [message.text, message.html]) {
      expect(content).toContain("Please do not reply to this automated email.")
      expect(content).toContain("booking chat in the app")
      expect(content).toContain("https://example.com/")
    }
    expect(fetch).toHaveBeenCalledOnce()
    expect(console.info).not.toHaveBeenCalled()
    expect(JSON.stringify(await response.json())).not.toContain(code)
  })

  it("omits the reply destination for OTP mail when disabled", async () => {
    mocks.isDev = false
    mocks.replyTo = undefined
    expect((await POST(request())).status).toBe(200)
    expect(mocks.sendMail.mock.calls[0]?.[0].replyTo).toBeUndefined()
    expect(console.info).not.toHaveBeenCalled()
  })
})
