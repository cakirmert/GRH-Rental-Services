/**
 * Utility functions for image optimization and caching
 */

/**
 * Get optimized image URL that uses the server-side cache
 * @param originalUrl - The original image URL
 * @returns Optimized image URL that goes through our caching proxy
 */
export function getOptimizedImageUrl(originalUrl: string): string {
  // If it's already a placeholder or local image, return as-is
  if (originalUrl.startsWith("/") || originalUrl.includes("placeholder")) {
    return originalUrl
  }

  // Check for any Vercel blob storage URL (more comprehensive)
  const isBlobStorage = originalUrl.includes(".blob.vercel-storage.com")

  // If it's a blob storage image, optimize it through our cache
  if (isBlobStorage) {
    return `/api/edgeImage?url=${encodeURIComponent(originalUrl)}`
  }

  // If it's an external image from our configured domain, optimize it
  if (typeof process !== "undefined" && process.env.IMAGE_DOMAIN) {
    const imageDomain = process.env.IMAGE_DOMAIN
    if (
      originalUrl.startsWith(`https://${imageDomain}/`) ||
      originalUrl.startsWith(`http://${imageDomain}/`)
    ) {
      return `/api/edgeImage?url=${encodeURIComponent(originalUrl)}`
    }
  }

  // Return original URL if not optimizable
  return originalUrl
}

/**
 * Get optimized image URLs for an array of images
 * @param imageUrls - Array of original image URLs
 * @returns Array of optimized image URLs
 */
export function getOptimizedImageUrls(imageUrls: string[]): string[] {
  return imageUrls.map(getOptimizedImageUrl)
}
