import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"

export const config = { runtime: "edge" }

// In-memory cache for optimized images
const imageCache = new Map<string, { buffer: Buffer; contentType: string; timestamp: number }>()
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours for images

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
    if (!imageUrl.startsWith(`https://${process.env.IMAGE_DOMAIN}/`)) {
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
    const cacheKey = `${imageUrl}:${format || "original"}`
    const now = Date.now()

    // Check cache first
    const cached = imageCache.get(cacheKey)
    if (cached && now - cached.timestamp < CACHE_TTL) {
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
      timestamp: now,
    })

    // Clean up old cache entries periodically
    if (Math.random() < 0.01) {
      // 1% chance to clean up
      for (const [key, value] of imageCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          imageCache.delete(key)
        }
      }
    }

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
