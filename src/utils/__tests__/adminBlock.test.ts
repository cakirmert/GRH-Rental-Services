import { describe, it, expect } from "vitest"
import { isAdminBlockBooking, getAdminBlockReason } from "../adminBlock"
import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"

describe("adminBlock", () => {
  describe("isAdminBlockBooking", () => {
    it("returns true when notes start with ADMIN_BLOCK_PREFIX", () => {
      const notes = `${ADMIN_BLOCK_PREFIX} Some reason`
      expect(isAdminBlockBooking({ notes })).toBe(true)
    })

    it("returns true when notes are exactly ADMIN_BLOCK_PREFIX", () => {
      expect(isAdminBlockBooking({ notes: ADMIN_BLOCK_PREFIX })).toBe(true)
    })

    it("returns false when notes do not start with ADMIN_BLOCK_PREFIX", () => {
      expect(isAdminBlockBooking({ notes: "Some other note" })).toBe(false)
    })

    it("returns false when notes are null", () => {
      expect(isAdminBlockBooking({ notes: null })).toBe(false)
    })

    it("returns false when notes are undefined", () => {
      expect(isAdminBlockBooking({ notes: undefined })).toBe(false)
    })

    it("returns false when notes are empty string", () => {
      expect(isAdminBlockBooking({ notes: "" })).toBe(false)
    })
  })

  describe("getAdminBlockReason", () => {
    it("returns the reason when notes start with ADMIN_BLOCK_PREFIX", () => {
      const reason = "Maintenance work"
      const notes = `${ADMIN_BLOCK_PREFIX} ${reason}`
      expect(getAdminBlockReason(notes)).toBe(reason)
    })

    it("returns null when notes do not start with ADMIN_BLOCK_PREFIX", () => {
      expect(getAdminBlockReason("Some other note")).toBe(null)
    })

    it("returns null when notes are exactly ADMIN_BLOCK_PREFIX", () => {
      expect(getAdminBlockReason(ADMIN_BLOCK_PREFIX)).toBe(null)
    })

    it("returns null when notes are ADMIN_BLOCK_PREFIX followed by whitespace", () => {
      expect(getAdminBlockReason(`${ADMIN_BLOCK_PREFIX}   `)).toBe(null)
    })

    it("returns null when notes are null", () => {
      expect(getAdminBlockReason(null)).toBe(null)
    })

    it("returns null when notes are undefined", () => {
      expect(getAdminBlockReason(undefined)).toBe(null)
    })

    it("returns null when notes are empty string", () => {
      expect(getAdminBlockReason("")).toBe(null)
    })
  })
})
