// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  nextAuth: vi.fn(),
  consumeBudget: vi.fn(),
  consumeBoundSecretState: vi.fn(),
  browserBinding: vi.fn(),
  consumeOtp: vi.fn(),
  credential: vi.fn(),
  user: vi.fn(),
}))
vi.mock("next-auth", () => ({ default: (config: unknown) => {
  mocks.nextAuth(config)
  return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() }
} }))
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }))
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }))
vi.mock("../prismadb", () => ({ default: {
  passkeyCredential: { findUnique: mocks.credential },
  user: { findUnique: mocks.user },
} }))
vi.mock("../auth/state", () => ({
  consumeBudget: mocks.consumeBudget,
  consumeBoundSecretState: mocks.consumeBoundSecretState,
  requestAddress: () => "test-address",
}))
vi.mock("../auth/ceremony", () => ({ browserBinding: mocks.browserBinding }))
vi.mock("../auth/otp", () => ({
  consumeOtp: mocks.consumeOtp,
  parseMailbox: (value: unknown) => typeof value === "string" && value === "user@example.com" ? value : null,
}))

await import("../../../auth")
type Provider = { id: string; authorize: (credentials: Record<string, unknown>, request: Request) => Promise<unknown> }
const providers = mocks.nextAuth.mock.calls[0][0].providers as Provider[]
const passkey = providers.find(p => p.id === "passkey")!
const otp = providers.find(p => p.id === "otp")!
const callback = new Request("https://example.com/api/auth/callback/passkey", { method: "POST" })
const token = "a".repeat(43)
const binding = "b".repeat(64)

describe("Auth.js provider admission boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.consumeBudget.mockResolvedValue(true)
    mocks.browserBinding.mockResolvedValue(binding)
    mocks.consumeBoundSecretState.mockResolvedValue({ userId: "user", credentialId: "credential", binding })
    mocks.credential.mockResolvedValue({ userId: "user", revokedAt: null })
    mocks.user.mockResolvedValue({ id: "user" })
    mocks.consumeOtp.mockResolvedValue(false)
  })

  it("charges both budgets on the direct callback before consuming its bound token", async () => {
    expect(await passkey.authorize({ token }, callback)).toEqual({ id: "user" })
    expect(mocks.consumeBudget.mock.calls).toEqual([
      ["passkey-exchange-global", "all", 600, 60_000],
      ["passkey-exchange-address", "test-address", 30, 60_000],
    ])
    expect(mocks.consumeBoundSecretState).toHaveBeenCalledWith("passkey-session", token, binding)
    expect(mocks.browserBinding.mock.invocationCallOrder[0]).toBeLessThan(mocks.consumeBoundSecretState.mock.invocationCallOrder[0])
  })

  it("caps invalid-token attempts at the provider and never looks up credentials", async () => {
    let addressAttempts = 0
    mocks.consumeBudget.mockImplementation(async (scope: string) =>
      scope === "passkey-exchange-global" || ++addressAttempts <= 30)
    const outcomes = await Promise.all(Array.from({ length: 45 }, () => passkey.authorize({ token: "bad" }, callback)))
    expect(outcomes.every(result => result === null)).toBe(true)
    expect(addressAttempts).toBe(45)
    expect(mocks.consumeBoundSecretState).not.toHaveBeenCalled()
    expect(mocks.credential).not.toHaveBeenCalled()
    expect(await passkey.authorize({ token }, callback)).toBeNull()
    expect(mocks.consumeBoundSecretState).not.toHaveBeenCalled()
  })

  it("does not consume a token when the browser cookie is absent", async () => {
    mocks.browserBinding.mockResolvedValue(null)
    expect(await passkey.authorize({ token }, callback)).toBeNull()
    expect(mocks.consumeBoundSecretState).not.toHaveBeenCalled()
  })

  it("does not consume state when the global or per-address budget is denied", async () => {
    mocks.consumeBudget.mockResolvedValueOnce(false)
    expect(await passkey.authorize({ token }, callback)).toBeNull()
    expect(mocks.consumeBudget).toHaveBeenCalledTimes(1)
    expect(mocks.consumeBoundSecretState).not.toHaveBeenCalled()
    mocks.consumeBudget.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await passkey.authorize({ token }, callback)).toBeNull()
    expect(mocks.consumeBoundSecretState).not.toHaveBeenCalled()
  })

  it("routes direct OTP callbacks through the atomic budgeted verifier", async () => {
    expect(await otp.authorize({ email: "user@example.com", token: "123456" }, callback)).toBeNull()
    expect(mocks.consumeOtp).toHaveBeenCalledWith("user@example.com", "123456")
    expect(mocks.user).not.toHaveBeenCalled()
  })
})
