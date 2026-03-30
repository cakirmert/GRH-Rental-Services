import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getOptimizedImageUrl, getOptimizedImageUrls } from "../imageUtils"

describe("imageUtils", () => {
  const originalImageDomain = process.env.IMAGE_DOMAIN

  afterEach(() => {
    process.env.IMAGE_DOMAIN = originalImageDomain
  })

  describe("getOptimizedImageUrl", () => {
    it("should return local paths as-is", () => {
      const url = "/images/test.jpg"
      expect(getOptimizedImageUrl(url)).toBe(url)
    })

    it("should return placeholder URLs as-is", () => {
      const url = "https://example.com/placeholder.png"
      expect(getOptimizedImageUrl(url)).toBe(url)
    })

    it("should transform Vercel blob storage URLs", () => {
      const url = "https://my-blob.public.blob.vercel-storage.com/test.jpg"
      const expected = `/api/edgeImage?url=${encodeURIComponent(url)}`
      expect(getOptimizedImageUrl(url)).toBe(expected)
    })

    it("should transform external URLs matching IMAGE_DOMAIN", () => {
      process.env.IMAGE_DOMAIN = "example.com"
      const url = "https://example.com/test.jpg"
      const expected = `/api/edgeImage?url=${encodeURIComponent(url)}`
      expect(getOptimizedImageUrl(url)).toBe(expected)

      const httpUrl = "http://example.com/test.jpg"
      const expectedHttp = `/api/edgeImage?url=${encodeURIComponent(httpUrl)}`
      expect(getOptimizedImageUrl(httpUrl)).toBe(expectedHttp)
    })

    it("should return other external URLs as-is", () => {
      process.env.IMAGE_DOMAIN = "example.com"
      const url = "https://other.com/test.jpg"
      expect(getOptimizedImageUrl(url)).toBe(url)
    })

    it("should return external URLs as-is when IMAGE_DOMAIN is not set", () => {
      delete process.env.IMAGE_DOMAIN
      const url = "https://example.com/test.jpg"
      expect(getOptimizedImageUrl(url)).toBe(url)
    })
  })

  describe("getOptimizedImageUrls", () => {
    it("should transform an array of URLs", () => {
      process.env.IMAGE_DOMAIN = "example.com"
      const urls = [
        "/local.jpg",
        "https://example.com/external.jpg",
        "https://other.com/other.jpg"
      ]
      const expected = [
        "/local.jpg",
        `/api/edgeImage?url=${encodeURIComponent("https://example.com/external.jpg")}`,
        "https://other.com/other.jpg"
      ]
      expect(getOptimizedImageUrls(urls)).toEqual(expected)
    })
  })
})
