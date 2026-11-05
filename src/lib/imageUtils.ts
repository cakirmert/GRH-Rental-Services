/** Sources go directly to next/image; no application-origin proxy hop. */
export function getOptimizedImageUrl(originalUrl: string): string {
  return originalUrl
}

export function getOptimizedImageUrls(imageUrls: string[]): string[] {
  return imageUrls.map(getOptimizedImageUrl)
}
