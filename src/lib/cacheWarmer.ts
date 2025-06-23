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
    }    // Check which images are already cached using edge cache detection
    console.log(`🔍 Checking cache status...`)
    const uncachedImages: string[] = []
    const cachedImages: string[] = []
      try {
      // Build URL with all images as query parameters for cache status check
      const checkUrl = new URL('/api/cache-status', baseUrl)
      allImageUrls.forEach(url => checkUrl.searchParams.append('url', url))
      
      const cacheCheckResponse = await fetch(checkUrl.toString())
      if (cacheCheckResponse.ok) {
        const cacheData = await cacheCheckResponse.json()
        
        cacheData.results.forEach((result: { url: string; cached: boolean; responseTime?: number; cacheStatus?: string }) => {
          if (result.cached) {
            cachedImages.push(result.url)
            const time = result.responseTime ? `${result.responseTime}ms` : 'fast'
            const status = result.cacheStatus === 'HIT' ? 'HIT' : 'fast'
            console.log(`💨 Already cached: ${result.url.split('/').pop()} (${time}, ${status})`)
          } else {
            uncachedImages.push(result.url)
          }
        })
        
        console.log(`💾 Cache check complete: ${cacheData.summary.cached} cached, ${cacheData.summary.uncached} need warming (${cacheData.summary.cacheRate}% cache rate)`)
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

    // Warm only uncached images in batches
    const warmBatchSize = 5
    
    for (let i = 0; i < uncachedImages.length; i += warmBatchSize) {
      const batch = uncachedImages.slice(i, i + warmBatchSize)
      
      const promises = batch.map(async (imageUrl) => {
        try {
          const cacheUrl = `${baseUrl}/api/edgeImage?url=${encodeURIComponent(imageUrl)}`
          
          const response = await fetch(cacheUrl)
          if (response.ok) {
            console.log(`✅ Warmed: ${imageUrl.split('/').pop()}`)
          } else {
            console.warn(`❌ Failed to warm: ${imageUrl.split('/').pop()}`)
          }
        } catch (error) {
          console.warn(`❌ Error warming ${imageUrl.split('/').pop()}:`, error)
        }
      })
      
      await Promise.all(promises)
      
      // Small delay between batches to avoid overwhelming
      if (i + warmBatchSize < uncachedImages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    console.log("🎉 Image cache warming complete!")
    
  } catch (error) {
    console.error("❌ Cache warming failed:", error)
  }
}

// CLI script version
if (require.main === module) {
  warmImageCache().then(() => process.exit(0))
}
