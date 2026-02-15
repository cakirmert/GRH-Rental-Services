import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { POST } from "./route"
import { otpFailures } from "../../../../../auth"
import prisma from "../../../../lib/prismadb"

// Mock dependencies
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({ body, init, status: init?.status || 200 })),
  },
}))

vi.mock("../../../../../auth", () => ({
  otpFailures: new Map(),
}))

vi.mock("../../../../lib/prismadb", () => ({
  default: {
    verificationToken: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock("@/utils/email", () => ({
  normalizeEmail: vi.fn((email) => email),
}))

describe("POST /api/auth/otp", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  // errorSpy removed as unused

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_SECRET = "secret"
    // Reset map
    ;(otpFailures as unknown as Map<unknown, unknown>).clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should log the sensitive token when verification fails", async () => {
    const req = {
      json: vi.fn().mockResolvedValue({ email: "test@example.com", token: "123456" }),
    } as unknown as Request

    // Simulate verification token not found
    const findFirstMock = prisma.verificationToken.findFirst as unknown as ReturnType<typeof vi.fn>
    findFirstMock.mockResolvedValue(null)

    await POST(req)

    // Verify vulnerability: check if the token is logged
    // The vulnerability is that it logs { identifier: key, token: fullToken }
    // fullToken is token + . + hash
    // We expect token to be redacted
    expect(logSpy).toHaveBeenCalledWith(
      "No valid verification token found for:",
      expect.objectContaining({
        identifier: "test@example.com",
        token: "[REDACTED]",
      }),
    )
  })
})
