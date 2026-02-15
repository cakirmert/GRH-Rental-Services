import { vi, describe, it, expect, beforeAll } from "vitest"

describe("WebAuthn Logging", () => {
  beforeAll(() => {
    vi.stubEnv("RP_ID", "example.com")
    vi.stubEnv("ORIGIN", "https://example.com")
  })

  it("should import webauthn module without errors", async () => {
    const webauthn = await import("../webauthn")
    expect(webauthn).toBeDefined()
    expect(webauthn.getAuthenticationOptions).toBeDefined()
  })

  it("should not crash when calling functions with mocked logging", async () => {
    // This test ensures that refactoring console.log doesn't break logic
    const webauthn = await import("../webauthn")

    // Mock console.log to spy on it
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    // We can't easily call getAuthenticationOptions because it needs complex input
    // But we can call normalizeCredentialId

    const result = webauthn.normalizeCredentialId("test-id")
    expect(result).toBeNull() // "test-id" is too short (min 16)

    const validId = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    const validResult = webauthn.normalizeCredentialId(validId)
    expect(validResult).toBe(validId)

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
