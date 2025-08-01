// src/lib/cacheWarmer.ts
import prisma from "@/lib/prismadb"

export async function warmImageCache() {
  console.log("🔥 Starting image cache warming...")
  
  try {
    // Get all items with images
    const items = await prisma.item.findMany({
      where: {
        active: true,
        imagesJson: { not: null }
      },
      select: { id: true, imagesJson: true, titleEn: true }
    })

    const allImageUrls = new Set<string>()
    
    // Collect all unique image URLs
    for (const item of items) {
      if (item.imagesJson) {
        try {
          const images = JSON.parse(item.imagesJson) as string[]
          images.forEach(url => {
            if (url.includes('blob.vercel-storage.com')) {
              allImageUrls.add(url)
            }
          })
        } catch {
          console.warn(`Failed to parse images for item ${item.id}`)
        }
      }
    }

    console.log(`📸 Found ${allImageUrls.size} unique images to warm`)

    // Simple server detection - no need for complex port checking
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}`
        : 'https://your-app.vercel.app'  // Replace with your actual domain
      : 'http://localhost:3000'  // Default dev port
    
    try {
      const healthCheck = await fetch(`${baseUrl}/api/edgeImage`)
      if (!healthCheck.ok && healthCheck.status !== 400) { // 400 is expected for missing URL param
        console.error(`❌ Server not responding at ${baseUrl}. Make sure Next.js is running.`)
        return
      }
      console.log(`📡 Server found at ${baseUrl}`)
    } catch {
      console.error(`❌ Server not accessible at ${baseUrl}. Make sure Next.js is running.`)
      console.error(`   Run 'npm run dev' first, then 'npm run warm-cache'`)
      return
    }

    // Fast cache status check using unified cache system
    console.log(`🔍 Checking cache status...`)
    const uncachedImages: string[] = []
    const cachedImages: string[] = []
    
    try {
      // Use the new cache status API which is much faster
      const checkUrl = new URL('/api/cache-status', baseUrl)
      allImageUrls.forEach(url => checkUrl.searchParams.append('url', url))
      
      const cacheCheckResponse = await fetch(checkUrl.toString())
      if (cacheCheckResponse.ok) {
        const cacheData = await cacheCheckResponse.json()
        
        cacheData.results.forEach((result: { url: string; cached: boolean; responseTime?: number; cacheStatus?: string }) => {
          if (result.cached) {
            cachedImages.push(result.url)
            console.log(`💨 Already cached: ${result.url.split('/').pop()} (instant, ${result.cacheStatus})`)
          } else {
            uncachedImages.push(result.url)
          }
        })
        
        console.log(`💾 Cache check complete: ${cacheData.summary.cached} cached, ${cacheData.summary.uncached} need warming (${cacheData.summary.cacheRate}% cache rate)`)
        
        // Show overall cache stats
        if (cacheData.cacheStats) {
          const stats = cacheData.cacheStats
          console.log(`📊 Cache stats: ${stats.size} items, ${Math.round(stats.totalSize / 1024 / 1024)}MB, ${stats.hitRate}% hit rate`)
        }
      } else {
        console.warn('❌ Could not check cache status, warming all images')
        uncachedImages.push(...Array.from(allImageUrls))
      }
    } catch (error) {
      console.warn('❌ Cache status check failed, warming all images:', error)
      uncachedImages.push(...Array.from(allImageUrls))
    }
    
    console.log(`✅ ${cachedImages.length} images already cached`)
    console.log(`⏳ ${uncachedImages.length} images need warming`)
    
    if (uncachedImages.length === 0) {
      console.log(`🎉 All images are already cached! No warming needed.`)
      return
    }

    // Warm only uncached images in optimized batches
    const warmBatchSize = 8 // Increased batch size for better performance
    let warmedCount = 0
    
    for (let i = 0; i < uncachedImages.length; i += warmBatchSize) {
      const batch = uncachedImages.slice(i, i + warmBatchSize)
      
      const promises = batch.map(async (imageUrl) => {
        try {
          const cacheUrl = `${baseUrl}/api/edgeImage?url=${encodeURIComponent(imageUrl)}`
          
          const response = await fetch(cacheUrl)
          if (response.ok) {
            warmedCount++
            console.log(`✅ Warmed: ${imageUrl.split('/').pop()} (${warmedCount}/${uncachedImages.length})`)
          } else {
            console.warn(`❌ Failed to warm: ${imageUrl.split('/').pop()}`)
          }
        } catch (error) {
          console.warn(`❌ Error warming ${imageUrl.split('/').pop()}:`, error)
        }
      })
      
      await Promise.all(promises)
      
      // Shorter delay between batches for faster warming
      if (i + warmBatchSize < uncachedImages.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    console.log(`🎉 Image cache warming complete! Warmed ${warmedCount}/${uncachedImages.length} images.`)
    
    // Final cache stats
    try {
      const finalStatsResponse = await fetch(`${baseUrl}/api/cache-status`)
      if (finalStatsResponse.ok) {
        const statsData = await finalStatsResponse.json()
        if (statsData.stats) {
          const stats = statsData.stats
          console.log(`📊 Final cache stats: ${stats.size} items, ${Math.round(stats.totalSize / 1024 / 1024)}MB, ${stats.hitRate}% hit rate`)
        }
      }
    } catch {
      // Ignore stats errors
    }
    
  } catch (error) {
    console.error("❌ Cache warming failed:", error)
  }
}

// CLI script version
if (require.main === module) {
  warmImageCache().then(() => process.exit(0))
}
