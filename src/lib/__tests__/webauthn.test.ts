import { describe, it, expect } from "vitest"
import { getCredentialIdCandidates, normalizeCredentialId } from "../webauthn"

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
    const base64 = "AAAAAAAAAAAAAAAAAAAA+/=="
    const expectedBase64url = "AAAAAAAAAAAAAAAAAAAA-_"
    expect(normalizeCredentialId(base64)).toBe(expectedBase64url)
  })

  it("exposes double-encoded IDs as compatibility candidates", () => {
    const id = "SGVsbG8td29ybGQtMTIzNDU2Nzg5MA"
    const doubleEncoded = Buffer.from(id).toString("base64url")
    expect(normalizeCredentialId(doubleEncoded)).toBe(doubleEncoded)
    expect(getCredentialIdCandidates(doubleEncoded)).toContain(id)
  })

  it("returns null for too short IDs", () => {
    expect(normalizeCredentialId("abc")).toBe(null)
  })
})
