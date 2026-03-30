import { describe, it, expect } from "vitest"
import { mapDbItemToClient, type MappableItem } from "../mapItem"

describe("mapDbItemToClient", () => {
  const baseItem: MappableItem = {
    id: "1",
    titleEn: "Title EN",
    titleDe: "Titel DE",
    descriptionEn: "Description EN",
    descriptionDe: "Beschreibung DE",
    type: "sports",
  }

  it("maps basic fields correctly with English locale", () => {
    const result = mapDbItemToClient(baseItem, "en")
    expect(result.id).toBe("1")
    expect(result.name).toBe("Title EN")
    expect(result.description).toBe("Description EN")
    expect(result.type).toBe("sports")
  })

  it("maps basic fields correctly with German locale", () => {
    const result = mapDbItemToClient(baseItem, "de")
    expect(result.name).toBe("Titel DE")
    expect(result.description).toBe("Beschreibung DE")
  })

  it("falls back to other locale if current locale field is missing", () => {
    const itemWithMissingDe: MappableItem = {
      ...baseItem,
      titleDe: null,
      descriptionDe: undefined as any,
    }
    const result = mapDbItemToClient(itemWithMissingDe, "de")
    expect(result.name).toBe("Title EN")
    expect(result.description).toBe("Description EN")
  })

  describe("normalizeImages", () => {
    it("uses images array if provided", () => {
      const item: MappableItem = {
        ...baseItem,
        images: ["img1.jpg", "img2.png"],
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toEqual(["img1.jpg", "img2.png"])
    })

    it("filters out falsy values from images array", () => {
      const item: MappableItem = {
        ...baseItem,
        images: ["img1.jpg", null as any, "", "img2.png"],
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toEqual(["img1.jpg", "img2.png"])
    })

    it("uses imagesJson if images array is empty or missing", () => {
      const item: MappableItem = {
        ...baseItem,
        images: [],
        imagesJson: JSON.stringify(["json1.jpg", "json2.png"]),
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toEqual(["json1.jpg", "json2.png"])
    })

    it("returns undefined if imagesJson is invalid JSON", () => {
      const item: MappableItem = {
        ...baseItem,
        imagesJson: "{invalid json",
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toBeUndefined()
    })

    it("returns undefined if imagesJson is not an array", () => {
      const item: MappableItem = {
        ...baseItem,
        imagesJson: JSON.stringify({ not: "an array" }),
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toBeUndefined()
    })

    it("returns undefined if both images and imagesJson are missing", () => {
      const item: MappableItem = {
        ...baseItem,
        images: null,
        imagesJson: null,
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.images).toBeUndefined()
    })
  })

  describe("normalizeRules", () => {
    it("parses newline-separated rules into an array", () => {
      const item: MappableItem = {
        ...baseItem,
        rulesEn: "Rule 1\nRule 2\n- Rule 3",
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.rules).toEqual(["Rule 1", "Rule 2", "Rule 3"])
    })

    it("returns a single string if there is only one rule", () => {
      const item: MappableItem = {
        ...baseItem,
        rulesEn: "Single Rule",
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.rules).toBe("Single Rule")
    })

    it("returns undefined if rules are empty", () => {
      const item: MappableItem = {
        ...baseItem,
        rulesEn: "  ",
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.rules).toBeUndefined()
    })
  })

  describe("numeric fields", () => {
    it("maps capacity and totalQuantity correctly", () => {
      const item: MappableItem = {
        ...baseItem,
        capacity: 10,
        totalQuantity: 5,
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.capacity).toBe(10)
      expect(result.totalQuantity).toBe(5)
    })

    it("defaults totalQuantity to 1 if missing or non-positive", () => {
      const item: MappableItem = {
        ...baseItem,
        totalQuantity: 0,
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.totalQuantity).toBe(1)
    })
  })

  describe("type normalization", () => {
    it("normalizes type to lowercase and validates", () => {
      const item: MappableItem = {
        ...baseItem,
        type: "ROOM",
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.type).toBe("room")
    })

    it("defaults to sports if type is invalid", () => {
      const item: MappableItem = {
        ...baseItem,
        type: "invalid-type",
      }
      const result = mapDbItemToClient(item, "en")
      expect(result.type).toBe("sports")
    })
  })
})
