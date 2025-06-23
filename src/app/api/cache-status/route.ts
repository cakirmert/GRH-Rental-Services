// src/app/api/cache-status/route.ts
import { NextRequest, NextResponse } from "next/server"
import { imageCache } from "@/lib/imageCache"

/**
 * Check image cache status using the unified cache system
 * Much faster than making HEAD requests to each image
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const checkUrls = url.searchParams.getAll("url")
    
    if (checkUrls.length === 0) {
      // Return cache stats if no specific URLs requested
      const stats = imageCache.getStats()
      const cachedUrls = imageCache.getCachedUrls()
      
      return NextResponse.json({ 
        info: "Cache status endpoint - use ?url=image1&url=image2 to check specific URLs",
        stats,
        cachedUrls: cachedUrls.slice(0, 10), // Show first 10 as example
        totalCachedUrls: cachedUrls.length
      })
    }

    // Use unified cache system for instant cache checking
    const results = checkUrls.map((imageUrl) => {
      const cached = imageCache.has(imageUrl)
      
      return {
        url: imageUrl,
        cached,
        responseTime: cached ? 0 : -1, // Cached items have instant response
        cacheStatus: cached ? 'HIT' : 'MISS',
        status: 'OK'
      }
    })

    const cachedCount = results.filter(r => r.cached).length
    const totalCount = checkUrls.length
    
    return NextResponse.json({
      summary: {
        total: totalCount,
        cached: cachedCount,
        uncached: totalCount - cachedCount,
        cacheRate: Math.round((cachedCount / totalCount) * 100)
      },
      results,
      cacheStats: imageCache.getStats()
    })
    
  } catch (error) {
    console.error("Cache status check failed:", error)
    return NextResponse.json({ 
      error: "Cache status check failed" 
    }, { status: 500 })
  }
}
