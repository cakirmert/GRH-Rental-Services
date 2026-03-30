import { describe, it, expect } from "vitest"
import { normalizeCredentialId } from "../webauthn"

describe("normalizeCredentialId", () => {
  it("returns null for null, undefined, empty, or whitespace-only strings", () => {
    expect(normalizeCredentialId(null)).toBeNull()
    expect(normalizeCredentialId(undefined)).toBeNull()
    expect(normalizeCredentialId("")).toBeNull()
    expect(normalizeCredentialId("   ")).toBeNull()
  })

  it("trims whitespace", () => {
    // 16 chars: "abcdefghijklmnop"
    const id = "  abcdefghijklmnop  "
    expect(normalizeCredentialId(id)).toBe("abcdefghijklmnop")
  })

  it("converts standard Base64 to Base64URL", () => {
    // 16 chars with + and /: "abcd+efg/hijklmo"
    // Standard Base64 might have padding: "abcd+efg/hijklmo="
    const base64 = "abcd+efg/hijklmo="
    const expected = "abcd-efg_hijklmo"
    expect(normalizeCredentialId(base64)).toBe(expected)
  })

  it("returns null if the normalized ID is shorter than 16 characters", () => {
    expect(normalizeCredentialId("abc")).toBeNull()
    expect(normalizeCredentialId("abcdefghijklmno")).toBeNull() // 15 chars
  })

  it("returns null if the normalized ID contains invalid characters", () => {
    // "!" is not valid in Base64URL
    expect(normalizeCredentialId("abcdefghijklmnop!")).toBeNull()
  })

  it("recovers double-encoded credential IDs", () => {
    // "YWJjZGVmZ2hpamtsbW5vcHFyc3R1" is Base64URL for "abcdefghijklmnopqrstu"
    const doubleEncoded = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1"
    const expected = "abcdefghijklmnopqrstu"
    expect(normalizeCredentialId(doubleEncoded)).toBe(expected)
  })

  it("prefers double-encoded recovery if it results in a valid candidate different from the original", () => {
    // "MTIzNDU2Nzg5MDEyMzQ1Ng" is Base64URL for "1234567890123456"
    const input = "MTIzNDU2Nzg5MDEyMzQ1Ng"
    const candidate = input
    const recovered = "1234567890123456"

    expect(normalizeCredentialId(input)).toBe(recovered)
  })

  it("falls back to candidate if double-encoded recovery results in invalid ID", () => {
    // "SGVsbG8" is Base64URL for "Hello" (too short)
    // We need an input that is at least 16 chars but decodes to something < 16 chars
    // "YWJjZGVmZ2hpamtsbW5v" (20 chars) -> "abcdefghijklmno" (15 chars)
    const input = "YWJjZGVmZ2hpamtsbW5v"
    expect(input.length).toBeGreaterThanOrEqual(16)

    // Recovery would be "abcdefghijklmno" which is 15 chars, so it should fall back to input
    expect(normalizeCredentialId(input)).toBe(input)
  })
})
