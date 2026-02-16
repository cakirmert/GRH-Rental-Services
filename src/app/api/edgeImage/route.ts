import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"
import { imageCache } from "@/lib/imageCache"

export const config = { runtime: "edge" }

const toUint8Array = (data: ArrayBuffer | ArrayBufferView): Uint8Array => {
  if (data instanceof Uint8Array) {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

const toArrayBuffer = (view: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(view.byteLength)
  new Uint8Array(buffer).set(view)
  return buffer
}

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
    const isVercelBlob = imageUrl.includes(".blob.vercel-storage.com")
    const isConfiguredDomain =
      process.env.IMAGE_DOMAIN && imageUrl.startsWith(`https://${process.env.IMAGE_DOMAIN}/`)

    if (!isVercelBlob && !isConfiguredDomain) {
      return NextResponse.json({ error: "Invalid image source" }, { status: 403 })
    }

    const accept = request.headers.get("accept") || ""
    let format: "webp" | "avif" | undefined = undefined
    if (accept.includes("image/avif")) {
      format = "avif"
    } else if (accept.includes("image/webp")) {
      format = "webp"
    }

    // Check cache first using unified cache system
    const cached = imageCache.get(imageUrl, format)

    if (cached) {
      return new NextResponse(toArrayBuffer(cached.buffer), {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Cache": "HIT",
          Vary: "Accept",
        },
      })
    }

    // Fetch and process image
    const originalResponse = await fetch(imageUrl)
    if (!originalResponse.ok) {
      throw new Error(`Failed to fetch source image: ${originalResponse.status}`)
    }
    const imageBuffer = new Uint8Array(await originalResponse.arrayBuffer())

    let optimizedBuffer: Uint8Array
    let contentType: string
    if (format) {
      const rendered = await sharp(imageBuffer)[format]({ quality: 80 }).toBuffer()
      optimizedBuffer = toUint8Array(rendered)
      contentType = `image/${format}`
    } else {
      optimizedBuffer = toUint8Array(imageBuffer)
      contentType = originalResponse.headers.get("Content-Type") || "image/jpeg"
    }

    // Cache the optimized image using unified cache system
    imageCache.set(imageUrl, optimizedBuffer, contentType, format)

    // Periodic cleanup for memory management
    if (Math.random() < 0.01) {
      // 1% chance to trigger cleanup
      imageCache.cleanup()
    }

    const response = new NextResponse(toArrayBuffer(optimizedBuffer), {
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
    let format: "webp" | "avif" | undefined = undefined
    if (accept.includes("image/avif")) {
      format = "avif"
    } else if (accept.includes("image/webp")) {
      format = "webp"
    }

    const cached = imageCache.get(imageUrl, format)

    if (cached) {
      // Image is cached, return cache hit headers
      return new NextResponse(null, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "Cache-Control": "public, max-age=31536000",
          "X-Cache": "HIT",
          Vary: "Accept",
        },
      })
    } else {
      // Image not cached, return cache miss headers
      return new NextResponse(null, {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=31536000",
          "X-Cache": "MISS",
          Vary: "Accept",
        },
      })
    }
  } catch (err) {
    console.error("Edge image HEAD error:", err)
    return new NextResponse(null, { status: 500 })
  }
}
