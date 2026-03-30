import { describe, it, expect } from "vitest"
import { mapDbItemToClient, type MappableItem } from "../mapItem"

describe("mapDbItemToClient", () => {
  const baseItem: MappableItem = {
    id: "1",
    titleEn: "Item 1",
    descriptionEn: "Description 1",
  }

  it("should handle images as a non-empty array", () => {
    const item: MappableItem = {
      ...baseItem,
      images: ["url1", "url2"],
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toEqual(["url1", "url2"])
  })

  it("should filter falsy values and convert to string in images array", () => {
    const item: MappableItem = {
      ...baseItem,
      images: ["url1", "", null as any, undefined as any, "url2"],
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toEqual(["url1", "url2"])
  })

  it("should handle imagesJson when images is empty", () => {
    const item: MappableItem = {
      ...baseItem,
      images: [],
      imagesJson: '["url3", "url4"]',
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toEqual(["url3", "url4"])
  })

  it("should prefer images array over imagesJson", () => {
    const item: MappableItem = {
      ...baseItem,
      images: ["url1"],
      imagesJson: '["url2"]',
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toEqual(["url1"])
  })

  it("should handle invalid imagesJson", () => {
    const item: MappableItem = {
      ...baseItem,
      images: [],
      imagesJson: 'invalid json',
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toBeUndefined()
  })

  it("should handle imagesJson not being an array", () => {
    const item: MappableItem = {
      ...baseItem,
      images: [],
      imagesJson: '{"url": "url1"}',
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toBeUndefined()
  })

  it("should handle both images and imagesJson being empty or null", () => {
    const item: MappableItem = {
      ...baseItem,
      images: null,
      imagesJson: "",
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toBeUndefined()
  })

  it("should filter falsy values and convert to string in parsed imagesJson", () => {
    const item: MappableItem = {
      ...baseItem,
      images: [],
      imagesJson: '["url1", "", null, "url2"]',
    }
    const result = mapDbItemToClient(item, "en")
    expect(result.images).toEqual(["url1", "url2"])
  })
})
