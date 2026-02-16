// src/lib/cacheWarmer.ts
import prisma from "@/lib/prismadb"

export async function warmImageCache() {
  try {
    // Get all items with images
    const items = await prisma.item.findMany({
      where: {
        active: true,
        imagesJson: { not: null },
      },
      select: { id: true, imagesJson: true, titleEn: true },
    })

    const allImageUrls = new Set<string>()

    // Collect all unique image URLs
    for (const item of items) {
      if (item.imagesJson) {
        try {
          const images = JSON.parse(item.imagesJson) as string[]
          images.forEach((url) => {
            if (url.includes("blob.vercel-storage.com")) {
              allImageUrls.add(url)
            }
          })
        } catch {
          // ignore
        }
      }
    }

    // Simple server detection - no need for complex port checking
    const baseUrl =
      process.env.NODE_ENV === "production"
        ? process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "https://your-app.vercel.app" // Replace with your actual domain
        : "http://localhost:3000" // Default dev port

    try {
      const healthCheck = await fetch(`${baseUrl}/api/edgeImage`)
      if (!healthCheck.ok && healthCheck.status !== 400) {
        return
      }
    } catch {
      return
    }

    // Fast cache status check using unified cache system
    const uncachedImages: string[] = []
    const cachedImages: string[] = []

    try {
      // Use the new cache status API which is much faster
      const checkUrl = new URL("/api/cache-status", baseUrl)
      allImageUrls.forEach((url) => checkUrl.searchParams.append("url", url))

      const cacheCheckResponse = await fetch(checkUrl.toString())
      if (cacheCheckResponse.ok) {
        const cacheData = await cacheCheckResponse.json()

        cacheData.results.forEach(
          (result: {
            url: string
            cached: boolean
            responseTime?: number
            cacheStatus?: string
          }) => {
            if (result.cached) {
              cachedImages.push(result.url)
            } else {
              uncachedImages.push(result.url)
            }
          },
        )
      } else {
        uncachedImages.push(...Array.from(allImageUrls))
      }
    } catch (error) {
      uncachedImages.push(...Array.from(allImageUrls))
    }

    if (uncachedImages.length === 0) {
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
          }
        } catch (error) {
          // ignore
        }
      })

      await Promise.all(promises)

      // Shorter delay between batches for faster warming
      if (i + warmBatchSize < uncachedImages.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    // Final cache stats
    try {
      await fetch(`${baseUrl}/api/cache-status`)
    } catch {
      // Ignore stats errors
    }
  } catch (error) {
    // ignore
  }
}

// CLI script version
if (require.main === module) {
  warmImageCache().then(() => process.exit(0))
}
