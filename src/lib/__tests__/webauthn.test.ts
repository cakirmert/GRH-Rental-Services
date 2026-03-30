import { describe, it, expect } from "vitest"
import { normalizeCredentialId } from "../webauthn"

describe("normalizeCredentialId", () => {
  it("returns null for empty input", () => {
    expect(normalizeCredentialId(null)).toBe(null)
    expect(normalizeCredentialId(undefined)).toBe(null)
    expect(normalizeCredentialId("")).toBe(null)
    expect(normalizeCredentialId("   ")).toBe(null)
  })

  it("leaves already normalized base64url IDs alone", () => {
    const id = "SGVsbG8td29ybGQtMTIzNDU2Nzg5MA" // Valid base64url, > 16 chars
    expect(normalizeCredentialId(id)).toBe(id)
  })

  it("converts base64 to base64url", () => {
    const base64 = "SGVsbG8rd29ybGQvMTIzNDU2Nzg5MA=="
    const expectedBase64url = "SGVsbG8td29ybGQtMTIzNDU2Nzg5MA"
    expect(normalizeCredentialId(base64)).toBe(expectedBase64url)
  })

  it("handles double-encoded IDs", () => {
    const id = "SGVsbG8td29ybGQtMTIzNDU2Nzg5MA"
    const doubleEncoded = Buffer.from(id).toString("base64url")
    expect(normalizeCredentialId(doubleEncoded)).toBe(id)
  })

  it("returns null for too short IDs", () => {
    expect(normalizeCredentialId("abc")).toBe(null)
  })
})
