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

  // If it's an external image from our IMAGE_DOMAIN, optimize it
  if (
    typeof process !== "undefined" &&
    process.env.IMAGE_DOMAIN &&
    originalUrl.includes(process.env.IMAGE_DOMAIN)
  ) {
    return `/api/edgeImage?url=${encodeURIComponent(originalUrl)}`
  }

  // For client-side, we'll need to check if it looks like our image domain
  if (typeof window !== "undefined" && originalUrl.includes("blob.core.windows.net")) {
    return `/api/edgeImage?url=${encodeURIComponent(originalUrl)}`
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
