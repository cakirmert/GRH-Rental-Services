import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"

// Note: Edge runtime cannot import our shared cache module due to restrictions
// We'll need to keep a local cache here and provide a different solution

// In-memory cache for optimized images (edge runtime compatible)
const imageCache = new Map<string, { buffer: Buffer; contentType: string; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours for images
let lastCleanup = Date.now() // Track when we last cleaned up

function getCacheKey(imageUrl: string, format?: string): string {
  return `${imageUrl}:${format || "original"}`
}

function cleanupExpiredEntries(): void {
  const now = Date.now()
  // Only cleanup every 10 minutes, not randomly
  if (now - lastCleanup < 10 * 60 * 1000) return
  
  let cleaned = 0
  for (const [key, value] of imageCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      imageCache.delete(key)
      cleaned++
    }
  }
  
  lastCleanup = now
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired cache entries`)
  }
}

export const config = { runtime: "edge" }

/**
 * Edge function for optimizing and serving images with format conversion and caching
 * @param request - The incoming request with image URL parameter
 * @returns Optimized image response
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const imageUrl = url.searchParams.get("url")
  if (!imageUrl) {
    return NextResponse.json({ error: "Missing image URL" }, { status: 400 })
  }

  try {
    // Allow any Vercel blob storage URL and configured image domain
    const isVercelBlob = imageUrl.includes('.blob.vercel-storage.com')
    const isConfiguredDomain = process.env.IMAGE_DOMAIN && 
                               imageUrl.startsWith(`https://${process.env.IMAGE_DOMAIN}/`)
    
    if (!isVercelBlob && !isConfiguredDomain) {
      console.log(`❌ Rejected image URL: ${imageUrl}`)
      console.log(`Expected Vercel blob storage URL or configured domain`)
      return NextResponse.json({ error: "Invalid image source" }, { status: 403 })
    }

    const accept = request.headers.get("accept") || ""
    let format: "webp" | "avif" | null = null
    if (accept.includes("image/avif")) {
      format = "avif"
    } else if (accept.includes("image/webp")) {
      format = "webp"
    }

    // Create cache key including format preference
    const cacheKey = getCacheKey(imageUrl, format || "original")

    // Check cache first
    const cached = imageCache.get(cacheKey)
    console.log(`🔍 Cache lookup for ${imageUrl.split('/').pop()}:`)
    console.log(`  - Cache key: ${cacheKey}`)
    console.log(`  - Cache has entry: ${imageCache.has(cacheKey)}`)
    console.log(`  - Total cache size: ${imageCache.size}`)
    console.log(`  - Cache entry valid: ${cached ? (Date.now() - cached.timestamp < CACHE_TTL) : false}`)
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✅ Cache HIT for ${imageUrl.split('/').pop()}`)
      return new NextResponse(cached.buffer, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Cache": "HIT",
          Vary: "Accept",
        },
      })
    }

    const originalResponse = await fetch(imageUrl)
    if (!originalResponse.ok) {
      throw new Error(`Failed to fetch source image: ${originalResponse.status}`)
    }
    const imageBuffer = new Uint8Array(await originalResponse.arrayBuffer())

    let optimizedBuffer: Buffer
    let contentType: string
    if (format) {
      optimizedBuffer = await sharp(imageBuffer)[format]({ quality: 80 }).toBuffer()
      contentType = `image/${format}`
    } else {
      optimizedBuffer = Buffer.from(imageBuffer)
      contentType = originalResponse.headers.get("Content-Type") || "image/jpeg"
    }

    // Cache the optimized image
    imageCache.set(cacheKey, {
      buffer: optimizedBuffer,
      contentType,
      timestamp: Date.now(),
    })
    
    console.log(`💾 Cached image ${imageUrl.split('/').pop()} with key: ${cacheKey}`)
    console.log(`📊 Cache now has ${imageCache.size} entries`)

    // Clean up expired entries periodically (every 10 minutes, not randomly!)
    cleanupExpiredEntries()

    const response = new NextResponse(optimizedBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Cache": "MISS",
        Vary: "Accept",
      },
    })
    return response
  } catch (err) {
    console.error("Edge image optimization error:", err)
    return NextResponse.redirect(imageUrl)
  }
}

/**
 * Handle HEAD requests for cache status checking
 * Returns the same headers as GET but without the body
 */
export async function HEAD(request: NextRequest) {
  const url = new URL(request.url)
  const imageUrl = url.searchParams.get("url")
  if (!imageUrl) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    // Check if image is in cache with format detection (same as GET)
    const accept = request.headers.get("Accept") || ""
    let format = undefined
    if (accept.includes("image/avif")) {
      format = "avif"
    } else if (accept.includes("image/webp")) {
      format = "webp"
    }

    const cacheKey = getCacheKey(imageUrl, format || "original")
    const cached = imageCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      // Image is cached, return cache hit headers
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=31536000',
          'X-Cache': 'HIT',
          'Vary': 'Accept'
        }
      })
    } else {
      // Image not cached, return cache miss headers
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=31536000',
          'X-Cache': 'MISS',
          'Vary': 'Accept'
        }
      })
    }
  } catch (err) {
    console.error("Edge image HEAD error:", err)
    return new NextResponse(null, { status: 500 })
  }
}
