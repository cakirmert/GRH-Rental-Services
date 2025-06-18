import { NextRequest, NextResponse } from "next/server"
import sharp from "sharp"

export const config = { runtime: "edge" }

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

    const originalResponse = await fetch(imageUrl)
    if (!originalResponse.ok) {
      throw new Error(`Failed to fetch source image: ${originalResponse.status}`)
    }
    const imageBuffer = new Uint8Array(await originalResponse.arrayBuffer())

    const accept = request.headers.get("accept") || ""
    let format: "webp" | "avif" | null = null
    if (accept.includes("image/avif")) {
      format = "avif"
    } else if (accept.includes("image/webp")) {
      format = "webp"
    }

    let optimizedBuffer: Buffer
    let contentType: string
    if (format) {
      optimizedBuffer = await sharp(imageBuffer)[format]({ quality: 80 }).toBuffer()
      contentType = `image/${format}`
    } else {
      optimizedBuffer = Buffer.from(imageBuffer)
      contentType = originalResponse.headers.get("Content-Type") || "image/jpeg"
    }

    const response = new NextResponse(optimizedBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        Vary: "Accept",
      },
    })
    return response
  } catch (err) {
    console.error("Edge image optimization error:", err)
    return NextResponse.redirect(imageUrl)
  }
}
