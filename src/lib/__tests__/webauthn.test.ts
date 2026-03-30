import { describe, it, expect } from "vitest"
import { normalizeCredentialId } from "../webauthn"

describe("normalizeCredentialId", () => {
  it("returns null for null, undefined, or empty strings", () => {
    expect(normalizeCredentialId(null)).toBeNull()
    expect(normalizeCredentialId(undefined)).toBeNull()
    expect(normalizeCredentialId("")).toBeNull()
    expect(normalizeCredentialId("   ")).toBeNull()
  })

  it("returns a valid base64url string as-is if it meets minimum length", () => {
    const validId = "a".repeat(16)
    expect(normalizeCredentialId(validId)).toBe(validId)

    const anotherValidId = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
    expect(normalizeCredentialId(anotherValidId)).toBe(anotherValidId)
  })

  it("normalizes standard base64 strings to base64url", () => {
    // Base64 with +, / and padding =
    // "Base64+with/Slash==" -> "Base64-with_Slash"
    const input = "Base64+with/Slash=="
    const expected = "Base64-with_Slash"
    expect(normalizeCredentialId(input)).toBe(expected)
  })

  it("trims whitespace from the input", () => {
    const input = "  abcdefghijklmnopqrstuv  "
    const expected = "abcdefghijklmnopqrstuv"
    expect(normalizeCredentialId(input)).toBe(expected)
  })

  it("recovers double-encoded credential IDs", () => {
    // Original ID (base64url)
    const originalId = "abcdefghijklmnopqrst"
    // Double encoded (base64url of the original ID string)
    const doubleEncoded = Buffer.from(originalId).toString("base64url")

    // Ensure the double encoded version is also long enough and valid base64url
    expect(doubleEncoded.length).toBeGreaterThanOrEqual(16)

    expect(normalizeCredentialId(doubleEncoded)).toBe(originalId)
  })

  it("returns null for strings shorter than MIN_CREDENTIAL_ID_LENGTH (16)", () => {
    const shortId = "abc123_def456-7" // 15 chars
    expect(normalizeCredentialId(shortId)).toBeNull()
  })

  it("returns null for strings with invalid characters that cannot be normalized or decoded into valid IDs", () => {
    const invalidId = "this is not base64!"
    expect(normalizeCredentialId(invalidId)).toBeNull()
  })

  it("handles cases where decoding yields a string that is not a valid candidate", () => {
    // "SGVsbG8gd29ybGQhISEhISE" decodes to "Hello world!!!!!!" which contains '!'
    const input = "SGVsbG8gd29ybGQhISEhISE"
    // It should return the input itself (if it's long enough and matches base64url pattern)
    // because the decoded version fails the BASE64URL_PATTERN test.
    expect(normalizeCredentialId(input)).toBe(input)
  })
})
