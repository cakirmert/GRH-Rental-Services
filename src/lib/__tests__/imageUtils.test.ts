import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getOptimizedImageUrl, getOptimizedImageUrls } from "../imageUtils"

describe("imageUtils", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("getOptimizedImageUrl", () => {
    it("returns local paths as-is", () => {
      const url = "/images/item.jpg"
      expect(getOptimizedImageUrl(url)).toBe(url)
    })

    it("returns placeholder URLs as-is", () => {
      const url = "https://example.com/placeholder.png"
      expect(getOptimizedImageUrl(url)).toBe(url)
    })

    it("optimizes Vercel blob storage URLs", () => {
      const url = "https://my-bucket.public.blob.vercel-storage.com/image.jpg"
      const expected = `/api/edgeImage?url=${encodeURIComponent(url)}`
      expect(getOptimizedImageUrl(url)).toBe(expected)
    })

    it("optimizes URLs from configured IMAGE_DOMAIN", () => {
      process.env.IMAGE_DOMAIN = "example.com"
      const url = "https://example.com/external-image.jpg"
      const expected = `/api/edgeImage?url=${encodeURIComponent(url)}`
      expect(getOptimizedImageUrl(url)).toBe(expected)
    })

    it("handles http for configured IMAGE_DOMAIN", () => {
      process.env.IMAGE_DOMAIN = "example.com"
      const url = "http://example.com/external-image.jpg"
      const expected = `/api/edgeImage?url=${encodeURIComponent(url)}`
      expect(getOptimizedImageUrl(url)).toBe(expected)
    })

    it("returns other external URLs as-is when IMAGE_DOMAIN is not set", () => {
      delete process.env.IMAGE_DOMAIN
      const url = "https://other-domain.com/image.jpg"
      expect(getOptimizedImageUrl(url)).toBe(url)
    })

    it("returns other external URLs as-is when IMAGE_DOMAIN does not match", () => {
      process.env.IMAGE_DOMAIN = "example.com"
      const url = "https://other-domain.com/image.jpg"
      expect(getOptimizedImageUrl(url)).toBe(url)
    })
  })

  describe("getOptimizedImageUrls", () => {
    it("optimizes an array of URLs", () => {
      process.env.IMAGE_DOMAIN = "example.com"
      const urls = [
        "/local.jpg",
        "https://my-bucket.public.blob.vercel-storage.com/blob.jpg",
        "https://example.com/external.jpg",
        "https://other.com/other.jpg",
      ]
      const results = getOptimizedImageUrls(urls)
      expect(results).toHaveLength(4)
      expect(results[0]).toBe("/local.jpg")
      expect(results[1]).toBe(`/api/edgeImage?url=${encodeURIComponent(urls[1])}`)
      expect(results[2]).toBe(`/api/edgeImage?url=${encodeURIComponent(urls[2])}`)
      expect(results[3]).toBe("https://other.com/other.jpg")
    })
  })
})
