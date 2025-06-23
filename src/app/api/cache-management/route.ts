// src/app/api/cache-management/route.ts
import { NextRequest, NextResponse } from "next/server"
import { imageCache } from "@/lib/imageCache"

/**
 * Cache management API for monitoring and controlling the image cache
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const action = url.searchParams.get("action")
    
    switch (action) {
      case "stats":
        return NextResponse.json({
          stats: imageCache.getStats(),
          cachedUrls: imageCache.getCachedUrls(),
          timestamp: new Date().toISOString()
        })
        
      case "clear":
        imageCache.clear()
        return NextResponse.json({ 
          message: "Cache cleared successfully",
          stats: imageCache.getStats()
        })
        
      case "cleanup":
        imageCache.cleanup()
        return NextResponse.json({ 
          message: "Cache cleanup completed",
          stats: imageCache.getStats()
        })
        
      default:
        return NextResponse.json({
          message: "Image cache management API",
          availableActions: ["stats", "clear", "cleanup"],
          usage: {
            stats: "/api/cache-management?action=stats",
            clear: "/api/cache-management?action=clear",
            cleanup: "/api/cache-management?action=cleanup"
          },
          currentStats: imageCache.getStats()
        })
    }
  } catch (error) {
    console.error("Cache management error:", error)
    return NextResponse.json({ 
      error: "Cache management failed" 
    }, { status: 500 })
  }
}

/**
 * Clear specific images from cache
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { urls } = body
    
    if (!Array.isArray(urls)) {
      return NextResponse.json({ 
        error: "Expected 'urls' array in request body" 
      }, { status: 400 })
    }
    
    let deletedCount = 0
    for (const url of urls) {
      if (imageCache.delete(url)) {
        deletedCount++
      }
    }
    
    return NextResponse.json({
      message: `Deleted ${deletedCount} images from cache`,
      deletedCount,
      totalRequested: urls.length,
      stats: imageCache.getStats()
    })
    
  } catch (error) {
    console.error("Cache deletion error:", error)
    return NextResponse.json({ 
      error: "Cache deletion failed" 
    }, { status: 500 })
  }
}
