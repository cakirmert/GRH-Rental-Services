import { describe, it, expect } from "vitest"
import { normalizeCredentialId } from "../webauthn"

describe("normalizeCredentialId", () => {
  it("should return null for null, undefined, or empty string", () => {
    expect(normalizeCredentialId(null)).toBeNull()
    expect(normalizeCredentialId(undefined)).toBeNull()
    expect(normalizeCredentialId("")).toBeNull()
    expect(normalizeCredentialId("   ")).toBeNull()
  })

  it("should return the id if it is already a valid base64url string", () => {
    const validId = "valid-id-with-sufficient-length"
    expect(normalizeCredentialId(validId)).toBe(validId)
  })

  it("should normalize base64 characters to base64url", () => {
    // '+' -> '-' and '/' -> '_'
    // 'test+test/test+test/test' -> 'test-test_test-test_test'
    // length must be >= 16
    const input = "test+test/test+test/test"
    const expected = "test-test_test-test_test"
    expect(normalizeCredentialId(input)).toBe(expected)
  })

  it("should remove padding characters", () => {
    // 'testtesttesttesttest===' -> 'testtesttesttesttest'
    // length must be >= 16
    const input = "testtesttesttesttest==="
    const expected = "testtesttesttesttest"
    expect(normalizeCredentialId(input)).toBe(expected)
  })

  it("should return null if the normalized id is too short", () => {
    const shortId = "short-id" // length 8
    expect(normalizeCredentialId(shortId)).toBeNull()
  })

  it("should return null if the id contains invalid characters", () => {
    const invalidId = "invalid$character@here"
    expect(normalizeCredentialId(invalidId)).toBeNull()
  })

  it("should recover double-encoded credential IDs", () => {
    // Create a valid ID (>= 16 chars)
    const originalId = "original-valid-credential-id"
    // Encode it as base64url
    const doubleEncoded = Buffer.from(originalId).toString("base64url")

    // The function should detect it's double encoded and return the original
    expect(normalizeCredentialId(doubleEncoded)).toBe(originalId)
  })

  it("should return the input if decoding results in an invalid ID (length)", () => {
    // "123456789012" (12 chars) -> "MTIzNDU2Nzg5MDEy" (16 chars).
    // Input: "MTIzNDU2Nzg5MDEy" (16 chars, valid format).
    // Decoded: "123456789012" (12 chars, invalid length).
    // So normalizeCredentialId("MTIzNDU2Nzg5MDEy") should return "MTIzNDU2Nzg5MDEy" (the input), NOT the decoded one.

    const validIdButShortDecoded = "MTIzNDU2Nzg5MDEy" // "123456789012" base64url encoded
    expect(validIdButShortDecoded.length).toBeGreaterThanOrEqual(16)

    // It should return the input because the decoded version is too short
    expect(normalizeCredentialId(validIdButShortDecoded)).toBe(validIdButShortDecoded)
  })

  it("should return the input if decoding results in invalid characters", () => {
    // base64url of "invalid$char" -> "aW52YWxpZCRjaGFy" (16 chars).
    // Input: "aW52YWxpZCRjaGFy" (16 chars, valid format).
    // Decoded: "invalid$char" (12 chars, invalid char $).
    // Should return input.

    const input = "aW52YWxpZCRjaGFy"
    expect(normalizeCredentialId(input)).toBe(input)
  })
})
