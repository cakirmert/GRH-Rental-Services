import { describe, it, expect } from "vitest"
import { mapDbItemToClient, type MappableItem } from "../mapItem"

describe("mapDbItemToClient", () => {
  it("should map english fields when locale is en", () => {
    const item: MappableItem = {
      id: "1",
      titleEn: "English Title",
      titleDe: "German Title",
      descriptionEn: "English Description",
      descriptionDe: "German Description",
      rulesEn: "English Rules",
      rulesDe: "German Rules",
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.name).toBe("English Title")
    expect(result.description).toBe("English Description")
    expect(result.rules).toBe("English Rules")
  })

  it("should map german fields when locale is de", () => {
    const item: MappableItem = {
      id: "1",
      titleEn: "English Title",
      titleDe: "German Title",
      descriptionEn: "English Description",
      descriptionDe: "German Description",
      rulesEn: "English Rules",
      rulesDe: "German Rules",
    }
    const result = mapDbItemToClient(item, "de")
    expect(result.name).toBe("German Title")
    expect(result.description).toBe("German Description")
    expect(result.rules).toBe("German Rules")
  })

  it("should fallback to english when locale is de but german fields are missing", () => {
    const item: MappableItem = {
      id: "1",
      titleEn: "English Title",
      descriptionEn: "English Description",
      rulesEn: "English Rules",
    }
    const result = mapDbItemToClient(item, "de")
    expect(result.name).toBe("English Title")
    expect(result.description).toBe("English Description")
    expect(result.rules).toBe("English Rules")
  })

  it("should fallback to german when locale is en but english fields are missing", () => {
    const item: MappableItem = {
      id: "1",
      titleDe: "German Title",
      descriptionDe: "German Description",
      rulesDe: "German Rules",
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.name).toBe("German Title")
    expect(result.description).toBe("German Description")
    expect(result.rules).toBe("German Rules")
  })

  it("should return empty strings for missing title and description", () => {
    const item: MappableItem = {
      id: "1",
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.name).toBe("")
    expect(result.description).toBe("")
    expect(result.rules).toBeUndefined()
  })

  it("should normalize valid types correctly", () => {
    const types = ["room", "sports", "game", "other"] as const
    types.forEach((type) => {
      const item: MappableItem = { id: "1", type }
      const result = mapDbItemToClient(item, "en")
      expect(result.type).toBe(type)
    })
  })

  it("should normalize valid types regardless of case", () => {
    const item: MappableItem = { id: "1", type: "RoOm" }
    const result = mapDbItemToClient(item, "en")
    expect(result.type).toBe("room")
  })

  it("should fallback to 'sports' for invalid types", () => {
    const item: MappableItem = { id: "1", type: "invalid" }
    const result = mapDbItemToClient(item, "en")
    expect(result.type).toBe("sports")
  })

  it("should parse rules string with bullets into an array", () => {
    const item: MappableItem = {
      id: "1",
      rulesEn: "- Rule 1\n- Rule 2\n- Rule 3",
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.rules).toEqual(["Rule 1", "Rule 2", "Rule 3"])
  })

  it("should not create an array for a single line rule", () => {
    const item: MappableItem = {
      id: "1",
      rulesEn: "- Just one rule",
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.rules).toBe("Just one rule")
  })

  it("should return undefined for empty rules", () => {
    const item: MappableItem = {
      id: "1",
      rulesEn: "   ",
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.rules).toBeUndefined()
  })

  it("should use 'images' array if provided", () => {
    const item: MappableItem = {
      id: "1",
      images: ["image1.png", "image2.png"],
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toEqual(["image1.png", "image2.png"])
  })

  it("should filter out falsy values in 'images' array", () => {
    const item: MappableItem = {
      id: "1",
      images: ["image1.png", "", null as any, "image2.png"],
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toEqual(["image1.png", "image2.png"])
  })

  it("should parse 'imagesJson' array if 'images' is missing", () => {
    const item: MappableItem = {
      id: "1",
      imagesJson: JSON.stringify(["image3.png", "image4.png"]),
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toEqual(["image3.png", "image4.png"])
  })

  it("should filter out falsy values when parsing 'imagesJson' array", () => {
    const item: MappableItem = {
      id: "1",
      imagesJson: JSON.stringify(["image3.png", "", null, "image4.png"]),
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toEqual(["image3.png", "image4.png"])
  })

  it("should correctly handle malformed JSON in 'imagesJson' by returning undefined", () => {
    const item: MappableItem = {
      id: "1",
      imagesJson: "invalid json [",
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toBeUndefined()
  })

  it("should return undefined for images if imagesJson is not an array", () => {
    const item: MappableItem = {
      id: "1",
      imagesJson: JSON.stringify({ key: "value" }),
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toBeUndefined()
  })

  it("should map capacity correctly", () => {
    const item: MappableItem = { id: "1", capacity: 5 }
    const result = mapDbItemToClient(item, "en")
    expect(result.capacity).toBe(5)
  })

  it("should ignore invalid capacity", () => {
    const item: MappableItem = { id: "1", capacity: Infinity }
    const result = mapDbItemToClient(item, "en")
    expect(result.capacity).toBeUndefined()
  })

  it("should map players correctly", () => {
    const item: MappableItem = { id: "1", players: "2-4" }
    const result = mapDbItemToClient(item, "en")
    expect(result.players).toBe("2-4")
  })

  it("should map totalQuantity correctly and default to 1 if missing or <= 0", () => {
    const item1: MappableItem = { id: "1", totalQuantity: 10 }
    expect(mapDbItemToClient(item1, "en").totalQuantity).toBe(10)

    const item2: MappableItem = { id: "1", totalQuantity: 0 }
    expect(mapDbItemToClient(item2, "en").totalQuantity).toBe(1)

    const item3: MappableItem = { id: "1", totalQuantity: -5 }
    expect(mapDbItemToClient(item3, "en").totalQuantity).toBe(1)

    const item4: MappableItem = { id: "1" }
    expect(mapDbItemToClient(item4, "en").totalQuantity).toBe(1)
  })
})
