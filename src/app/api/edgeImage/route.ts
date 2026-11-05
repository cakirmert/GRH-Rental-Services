import { NextRequest, NextResponse } from "next/server"
import { ownedImageUrl } from "@/lib/imageSource"

// Old bookmarks redirect to the owned CDN. This route never fetches or serves
// attacker-selected bytes from the application origin.
export function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url")
  if (!source) return NextResponse.json({ error: "Missing image URL" }, { status: 400 })
  const url = ownedImageUrl(source)
  if (!url) return NextResponse.json({ error: "Invalid image source" }, { status: 403 })
  const response = NextResponse.redirect(url, 307)
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("X-Content-Type-Options", "nosniff")
  return response
}

export const HEAD = GET
