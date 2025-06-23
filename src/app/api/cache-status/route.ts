// src/app/api/cache-status/route.ts
import { NextRequest, NextResponse } from "next/server"

/**
 * Check image cache status by measuring response times from the edge image API
 * Fast responses (< 100ms) or X-Cache: HIT headers indicate cached images
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const checkUrls = url.searchParams.getAll("url")
    
    if (checkUrls.length === 0) {
      return NextResponse.json({ 
        error: "No URLs provided to check",
        usage: "Use ?url=image1&url=image2 to check specific URLs",
        example: "/api/cache-status?url=https://example.com/image.jpg"
      }, { status: 400 })
    }

    const baseUrl = url.protocol + '//' + url.host
    
    // Check each URL by measuring response time and cache headers
    const results = await Promise.all(
      checkUrls.map(async (imageUrl) => {
        try {
          const edgeUrl = `${baseUrl}/api/edgeImage?url=${encodeURIComponent(imageUrl)}`
          const start = Date.now()
          
          // Make a HEAD request to avoid downloading the full image
          const response = await fetch(edgeUrl, { method: 'HEAD' })
          const duration = Date.now() - start
          const cacheHeader = response.headers.get('X-Cache')
            // Image is cached if we get cache hit header OR response is very fast
          const isCached = cacheHeader === 'HIT' || (cacheHeader !== 'MISS' && duration < 100)
          
          return {
            url: imageUrl,
            cached: isCached,
            responseTime: duration,
            cacheStatus: cacheHeader || 'UNKNOWN',
            status: response.ok ? 'OK' : `ERROR ${response.status}`
          }
        } catch {
          return {
            url: imageUrl,
            cached: false,
            responseTime: -1,
            cacheStatus: 'ERROR',
            status: 'FETCH_FAILED'
          }
        }
      })
    )

    const cachedCount = results.filter(r => r.cached).length
    const totalCount = checkUrls.length
    
    return NextResponse.json({
      summary: {
        total: totalCount,
        cached: cachedCount,
        uncached: totalCount - cachedCount,
        cacheRate: Math.round((cachedCount / totalCount) * 100)
      },
      results
    })
    
  } catch (error) {
    console.error("Cache status check failed:", error)
    return NextResponse.json({ 
      error: "Cache status check failed" 
    }, { status: 500 })
  }
}
