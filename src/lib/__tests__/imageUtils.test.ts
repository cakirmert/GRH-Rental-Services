import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { getOptimizedImageUrl, getOptimizedImageUrls } from "../imageUtils"

describe("imageUtils", () => {
  describe("getOptimizedImageUrl", () => {
    const originalEnv = process.env

    beforeEach(() => {
      // Manually manage process.env isolation since vi.stubEnv might not work in bun test
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it("returns local image URLs as-is", () => {
      const localUrl = "/images/profile.jpg"
      expect(getOptimizedImageUrl(localUrl)).toBe(localUrl)
    })

    it("returns placeholder image URLs as-is", () => {
      const placeholderUrl = "https://example.com/placeholder-image.png"
      expect(getOptimizedImageUrl(placeholderUrl)).toBe(placeholderUrl)
    })

    it("converts Vercel Blob Storage URLs to the cached /api/edgeImage proxy format", () => {
      const blobUrl = "https://my-app.blob.vercel-storage.com/image.jpg"
      const expectedUrl = `/api/edgeImage?url=${encodeURIComponent(blobUrl)}`
      expect(getOptimizedImageUrl(blobUrl)).toBe(expectedUrl)
    })

    it("uses process.env.IMAGE_DOMAIN to convert matching external URLs (https)", () => {
      process.env.IMAGE_DOMAIN = "allowed-domain.com"
      const externalUrl = "https://allowed-domain.com/image.png"
      const expectedUrl = `/api/edgeImage?url=${encodeURIComponent(externalUrl)}`
      expect(getOptimizedImageUrl(externalUrl)).toBe(expectedUrl)
    })

    it("uses process.env.IMAGE_DOMAIN to convert matching external URLs (http)", () => {
      process.env.IMAGE_DOMAIN = "allowed-domain.com"
      const externalUrl = "http://allowed-domain.com/image.png"
      const expectedUrl = `/api/edgeImage?url=${encodeURIComponent(externalUrl)}`
      expect(getOptimizedImageUrl(externalUrl)).toBe(expectedUrl)
    })

    it("returns unrecognized external domain URLs as-is when IMAGE_DOMAIN is set", () => {
      process.env.IMAGE_DOMAIN = "allowed-domain.com"
      const externalUrl = "https://other-domain.com/image.png"
      expect(getOptimizedImageUrl(externalUrl)).toBe(externalUrl)
    })

    it("returns unrecognized external domain URLs as-is when IMAGE_DOMAIN is not set", () => {
      delete process.env.IMAGE_DOMAIN
      const externalUrl = "https://allowed-domain.com/image.png"
      expect(getOptimizedImageUrl(externalUrl)).toBe(externalUrl)
    })
  })

  describe("getOptimizedImageUrls", () => {
    it("correctly applies getOptimizedImageUrl over an array of URLs", () => {
      process.env.IMAGE_DOMAIN = "allowed.com"
      const urls = [
        "/local.png",
        "https://my.blob.vercel-storage.com/1.jpg",
        "https://allowed.com/2.png",
        "https://other.com/3.png",
        "https://example.com/placeholder.jpg"
      ]

      const expected = [
        "/local.png",
        `/api/edgeImage?url=${encodeURIComponent("https://my.blob.vercel-storage.com/1.jpg")}`,
        `/api/edgeImage?url=${encodeURIComponent("https://allowed.com/2.png")}`,
        "https://other.com/3.png",
        "https://example.com/placeholder.jpg"
      ]

      expect(getOptimizedImageUrls(urls)).toEqual(expected)
    })
  })
})
