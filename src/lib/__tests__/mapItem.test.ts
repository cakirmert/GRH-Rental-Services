import { describe, it, expect } from "vitest"
import { mapDbItemToClient, type MappableItem } from "../mapItem"

describe("mapDbItemToClient", () => {
  const baseItem: MappableItem = {
    id: "item-123",
    type: "sports",
    titleEn: "Tennis Racket",
    titleDe: "Tennisschläger",
    descriptionEn: "High quality racket",
    descriptionDe: "Hochwertiger Schläger",
    rulesEn: "- No throwing",
    rulesDe: "- Nicht werfen",
    capacity: 1,
    players: "2",
    images: ["image1.jpg"],
    imagesJson: null,
    totalQuantity: 10,
  }

  describe("Localization", () => {
    it("returns English content when locale is 'en'", () => {
      const result = mapDbItemToClient(baseItem, "en")
      expect(result.name).toBe("Tennis Racket")
      expect(result.description).toBe("High quality racket")
      expect(result.rules).toBe("No throwing")
    })

    it("returns German content when locale is 'de'", () => {
      const result = mapDbItemToClient(baseItem, "de")
      expect(result.name).toBe("Tennisschläger")
      expect(result.description).toBe("Hochwertiger Schläger")
      expect(result.rules).toBe("Nicht werfen")
    })

    it("falls back to German content if English is missing and locale is 'en'", () => {
      const item = { ...baseItem, titleEn: null, descriptionEn: null, rulesEn: null }
      const result = mapDbItemToClient(item, "en")
      expect(result.name).toBe("Tennisschläger")
      expect(result.description).toBe("Hochwertiger Schläger")
      expect(result.rules).toBe("Nicht werfen")
    })

    it("falls back to English content if German is missing and locale is 'de'", () => {
      const item = { ...baseItem, titleDe: null, descriptionDe: null, rulesDe: null }
      const result = mapDbItemToClient(item, "de")
      expect(result.name).toBe("Tennis Racket")
      expect(result.description).toBe("High quality racket")
      expect(result.rules).toBe("No throwing")
    })
  })

  describe("Image Normalization", () => {
    it("uses 'images' array if present", () => {
      const item = { ...baseItem, images: ["img1.jpg", "img2.jpg"] }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toEqual(["img1.jpg", "img2.jpg"])
    })

    it("uses 'imagesJson' if 'images' array is empty or missing", () => {
      const item = { ...baseItem, images: [], imagesJson: '["json1.jpg", "json2.jpg"]' }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toEqual(["json1.jpg", "json2.jpg"])
    })

    it("handles invalid 'imagesJson'", () => {
      const item = { ...baseItem, images: [], imagesJson: "invalid-json" }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toBeUndefined()
    })

    it("returns undefined if no images are present", () => {
      const item = { ...baseItem, images: [], imagesJson: null }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toBeUndefined()
    })
  })

  describe("Rules Normalization", () => {
    it("handles single line rule string", () => {
      const item = { ...baseItem, rulesEn: "Rule 1" }
      const result = mapDbItemToClient(item, "en")
      expect(result.rules).toBe("Rule 1")
    })

    it("handles multi-line rule string", () => {
      const item = { ...baseItem, rulesEn: "- Rule 1\n- Rule 2" }
      const result = mapDbItemToClient(item, "en")
      expect(result.rules).toEqual(["Rule 1", "Rule 2"])
    })

    it("strips leading hyphens from rules", () => {
      const item = { ...baseItem, rulesEn: "-  Rule with hyphen" }
      const result = mapDbItemToClient(item, "en")
      expect(result.rules).toBe("Rule with hyphen")
    })
  })

  describe("Type Handling", () => {
    it("handles valid types case-insensitively", () => {
      const types = ["Room", "SPORTS", "game", "Other"]
      types.forEach((type) => {
        const item = { ...baseItem, type }
        const result = mapDbItemToClient(item, "en")
        expect(result.type).toBe(type.toLowerCase())
      })
    })

    it("defaults to 'sports' for invalid types", () => {
      const item = { ...baseItem, type: "invalid-type" }
      const result = mapDbItemToClient(item, "en")
      expect(result.type).toBe("sports")
    })
  })

  describe("Numeric Fields", () => {
    it("handles valid capacity", () => {
      const item = { ...baseItem, capacity: 5 }
      const result = mapDbItemToClient(item, "en")
      expect(result.capacity).toBe(5)
    })

    it("handles invalid capacity (non-finite)", () => {
      const item = { ...baseItem, capacity: Infinity }
      const result = mapDbItemToClient(item, "en")
      expect(result.capacity).toBeUndefined()
    })

    it("handles valid totalQuantity", () => {
        const item = { ...baseItem, totalQuantity: 50 }
        const result = mapDbItemToClient(item, "en")
        expect(result.totalQuantity).toBe(50)
      })

    it("defaults totalQuantity to 1 if missing or invalid", () => {
      const item = { ...baseItem, totalQuantity: 0 }
      const result = mapDbItemToClient(item, "en")
      expect(result.totalQuantity).toBe(1)
    })
  })
})
