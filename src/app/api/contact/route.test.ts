import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { POST } from "./route"
const budgets = vi.hoisted(() => new Map<string, number>())
vi.mock("@/lib/auth/state", () => ({
  requestAddress: (req: Request) => req.headers.get("x-forwarded-for") || "local",
  consumeBudget: vi.fn(async (scope: string, subject: string, limit: number) => {
    const key = scope + subject
    const count = (budgets.get(key) || 0) + 1
    budgets.set(key, count)
    return count <= limit
  }),
}))

// Mock Next.js Response
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status || 200,
      json: async () => body,
    })),
  },
}))

// Mock mail transporter
vi.mock("@/lib/mail", () => ({
  transporter: {
    sendMail: vi.fn().mockResolvedValue({}),
  },
  isDev: false,
  CONTACT_EMAIL: "contact@example.com",
  EMAIL_FROM: "automated@example.com",
}))

describe("POST /api/contact", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    budgets.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should return 400 for invalid input", async () => {
    const req = {
      headers: new Headers(),
      json: async () => ({
        name: "", // empty name
        email: "invalid-email",
        room: "101",
        issue: "test",
        message: "hello",
      }),
    } as unknown as Request

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Invalid input")
  })

  it("should rate limit requests from the same IP", async () => {
    const payload = {
      name: "Test User",
      email: "test@example.com",
      room: "101",
      issue: "test",
      message: "hello",
    }

    const makeRequest = async () => {
      const req = {
        headers: new Headers({ "x-forwarded-for": "1.2.3.4" }),
        json: async () => payload,
      } as unknown as Request
      return await POST(req)
    }

    // First 5 requests should be fine
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest()
      expect(res.status).toBe(200)
    }

    // 6th request should be rate limited
    const res = await makeRequest()
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toContain("Too many requests")
  })

  it("should require Turnstile token if secret is configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret"

    const req = {
      headers: new Headers({ "x-forwarded-for": "5.6.7.8" }),
      json: async () => ({
        name: "Test User",
        email: "test@example.com",
        room: "101",
        issue: "test",
        message: "hello",
      }),
    } as unknown as Request

    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Security verification required")

    delete process.env.TURNSTILE_SECRET_KEY
  })

  it("should sanitize issue field to prevent email header injection", async () => {
    const { transporter } = await import("@/lib/mail")

    const req = {
      headers: new Headers({ "x-forwarded-for": "9.10.11.12" }),
      json: async () => ({
        name: "Test User",
        email: "test@example.com",
        room: "101",
        issue: "Line1\nBcc: victim@example.com",
        message: "hello",
      }),
    } as unknown as Request

    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(transporter!.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "contact@example.com",
        from: "automated@example.com",
        replyTo: "test@example.com",
        subject: "Contact form: Line1 Bcc: victim@example.com",
      }),
    )
  })

  it.each(["one@example.com,two@example.com", "one@example.com\r\nBcc: two@example.com"])(
    "rejects a submitter address that cannot safely be a reply destination: %j", async (email) => {
      const { transporter } = await import("@/lib/mail")
      const req = {
        headers: new Headers(),
        json: async () => ({ name: "Test User", email, room: "101", issue: "test", message: "hello" }),
      } as unknown as Request
      expect((await POST(req)).status).toBe(400)
      expect(transporter!.sendMail).not.toHaveBeenCalled()
    },
  )
})
