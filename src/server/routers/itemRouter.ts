// src/server/routers/items.ts
import { router, publicProcedure } from "@/lib/trpcServer"
import { z } from "zod"
import type { Item } from "@prisma/client"

// In-memory cache for items - perfectly fine for production!
let itemsCache: Item[] | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export const itemsRouter = router({
  all: publicProcedure.query(async ({ ctx }) => {
    const now = Date.now()

    // Return cached data if it's still fresh
    if (itemsCache && now - cacheTimestamp < CACHE_TTL) {
      return itemsCache
    }

    // Fetch fresh data and cache it
    const items = await ctx.prisma.item.findMany({
      where: { active: true },
    })

    itemsCache = items
    cacheTimestamp = now

    return items
  }),
  byType: publicProcedure
    .input(
      z.object({
        types: z.array(z.enum(["ROOM", "SPORTS", "GAME", "OTHER"])).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const now = Date.now()

      // Use cached data if available and fresh
      if (itemsCache && now - cacheTimestamp < CACHE_TTL) {
        // Filter from cache
        if (input.types && input.types.length > 0) {
          return itemsCache.filter((item) => input.types!.includes(item.type))
        }
        return itemsCache
      }

      // Fetch fresh data if cache is stale
      const allItems = await ctx.prisma.item.findMany({
        where: { active: true },
      })

      // Update cache
      itemsCache = allItems
      cacheTimestamp = now

      // Filter and return
      if (input.types && input.types.length > 0) {
        return allItems.filter((item) => input.types!.includes(item.type))
      }
      return allItems
    }),
  byId: publicProcedure
    .input((val: unknown) => {
      if (typeof val !== "string") throw new Error("Invalid ID")
      return val
    })
    .query(({ input, ctx }) =>
      ctx.prisma.item.findFirst({
        where: { id: input, active: true }, // Ensure the item is active
      }),
    ),
})
