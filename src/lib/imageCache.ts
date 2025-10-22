// src/lib/imageCache.ts
// Edge-runtime compatible image cache using Map instead of LRU cache

export interface CachedImage {
  buffer: Uint8Array
  contentType: string
  timestamp: number
  originalUrl: string
  format?: string
  size: number
}

export interface CacheStats {
  size: number
  hits: number
  misses: number
  hitRate: number
  totalSize: number
}

class ImageCacheManager {
  private cache: Map<string, CachedImage>
  private stats = { hits: 0, misses: 0 }
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024 // 100MB
  private totalSize = 0

  constructor() {
    this.cache = new Map<string, CachedImage>()
  }

  getCacheKey(imageUrl: string, format?: string): string {
    return `${imageUrl}:${format || "original"}`
  }

  get(imageUrl: string, format?: string): CachedImage | undefined {
    const key = this.getCacheKey(imageUrl, format)
    const item = this.cache.get(key)
    
    if (item) {
      // Check if expired
      if (Date.now() - item.timestamp > this.CACHE_TTL) {
        this.cache.delete(key)
        this.totalSize -= item.size
        this.stats.misses++
        return undefined
      }
      this.stats.hits++
      return item
    } else {
      this.stats.misses++
      return undefined
    }
  }

  private toUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
    if (data instanceof Uint8Array) {
      return data
    }

    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data)
    }

    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }

  set(imageUrl: string, buffer: ArrayBuffer | ArrayBufferView, contentType: string, format?: string): void {
    const key = this.getCacheKey(imageUrl, format)
    const normalized = this.toUint8Array(buffer)
    const item: CachedImage = {
      buffer: normalized,
      contentType,
      timestamp: Date.now(),
      originalUrl: imageUrl,
      format,
      size: normalized.byteLength
    }
    
    // Remove old item if exists
    const existing = this.cache.get(key)
    if (existing) {
      this.totalSize -= existing.size
    }
    
    // Check if adding this item would exceed max size
    if (this.totalSize + item.size > this.MAX_CACHE_SIZE) {
      this.cleanup()
    }
    
    this.cache.set(key, item)
    this.totalSize += item.size
  }

  has(imageUrl: string, format?: string): boolean {
    const key = this.getCacheKey(imageUrl, format)
    const item = this.cache.get(key)
    if (!item) return false
    
    // Check if expired
    if (Date.now() - item.timestamp > this.CACHE_TTL) {
      this.cache.delete(key)
      this.totalSize -= item.size
      return false
    }
    
    return true
  }

  delete(imageUrl: string, format?: string): boolean {
    const key = this.getCacheKey(imageUrl, format)
    const item = this.cache.get(key)
    if (item) {
      this.totalSize -= item.size
      return this.cache.delete(key)
    }
    return false
  }

  clear(): void {
    this.cache.clear()
    this.totalSize = 0
    this.stats = { hits: 0, misses: 0 }
  }

  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? Math.round((this.stats.hits / totalRequests) * 100) : 0,
      totalSize: this.totalSize
    }
  }

  getCachedUrls(): string[] {
    const urls = new Set<string>()
    for (const [, item] of this.cache.entries()) {
      urls.add(item.originalUrl)
    }
    return Array.from(urls)
  }

  // Batch check for cache status - much more efficient
  checkMultiple(imageUrls: string[], format?: string): { cached: string[], uncached: string[] } {
    const cached: string[] = []
    const uncached: string[] = []
    
    for (const url of imageUrls) {
      if (this.has(url, format)) {
        cached.push(url)
      } else {
        uncached.push(url)
      }
    }
    
    return { cached, uncached }
  }

  // Memory-safe cleanup for production
  cleanup(): void {
    const beforeSize = this.cache.size
    const now = Date.now()
    let freedSize = 0
    
    // Remove expired entries
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.CACHE_TTL) {
        this.cache.delete(key)
        freedSize += item.size
      }
    }
    
    // If still over limit, remove oldest entries
    if (this.totalSize - freedSize > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries())
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
      
      for (const [key, item] of entries) {
        if (this.totalSize - freedSize <= this.MAX_CACHE_SIZE * 0.8) break
        this.cache.delete(key)
        freedSize += item.size
      }
    }
    
    this.totalSize -= freedSize
    const afterSize = this.cache.size
    
    if (beforeSize > afterSize) {
      console.log(`🧹 Cleaned up ${beforeSize - afterSize} cache entries, freed ${Math.round(freedSize / 1024 / 1024)}MB`)
    }
  }
}

// Singleton instance for edge runtime compatibility
export const imageCache = new ImageCacheManager()

// Export for testing
export { ImageCacheManager }
