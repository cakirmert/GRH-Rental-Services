import { describe, it, expect } from "vitest"
import { isAdminBlockBooking, getAdminBlockReason } from "../adminBlock"
import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"

describe("adminBlock utilities", () => {
  describe("isAdminBlockBooking", () => {
    it("returns false if booking has no notes", () => {
      expect(isAdminBlockBooking({})).toBe(false)
      expect(isAdminBlockBooking({ notes: null })).toBe(false)
      expect(isAdminBlockBooking({ notes: undefined })).toBe(false)
      expect(isAdminBlockBooking({ notes: "" })).toBe(false)
    })

    it("returns false if notes do not start with ADMIN_BLOCK_PREFIX", () => {
      expect(isAdminBlockBooking({ notes: "Some other note" })).toBe(false)
      expect(isAdminBlockBooking({ notes: " " + ADMIN_BLOCK_PREFIX })).toBe(false)
    })

    it("returns true if notes start with ADMIN_BLOCK_PREFIX", () => {
      expect(isAdminBlockBooking({ notes: ADMIN_BLOCK_PREFIX })).toBe(true)
      expect(isAdminBlockBooking({ notes: `${ADMIN_BLOCK_PREFIX} reason` })).toBe(true)
    })
  })

  describe("getAdminBlockReason", () => {
    it("returns null if notes are empty or null", () => {
      expect(getAdminBlockReason(null)).toBe(null)
      expect(getAdminBlockReason(undefined)).toBe(null)
      expect(getAdminBlockReason("")).toBe(null)
    })

    it("returns null if notes do not start with ADMIN_BLOCK_PREFIX", () => {
      expect(getAdminBlockReason("Some note")).toBe(null)
    })

    it("returns null if notes contain only the prefix (trimmed result is empty)", () => {
      expect(getAdminBlockReason(ADMIN_BLOCK_PREFIX)).toBe(null)
      expect(getAdminBlockReason(`${ADMIN_BLOCK_PREFIX} `)).toBe(null)
    })

    it("returns the trimmed reason when notes start with the prefix and have content", () => {
      expect(getAdminBlockReason(`${ADMIN_BLOCK_PREFIX} Maintenance`)).toBe("Maintenance")
      expect(getAdminBlockReason(`${ADMIN_BLOCK_PREFIX}   Cleanup  `)).toBe("Cleanup")
    })
  })
})
