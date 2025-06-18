// src/server/routers/items.ts
import { router, publicProcedure } from "@/server/trpcServer"
export const itemsRouter = router({
  all: publicProcedure.query(({ ctx }) =>
    ctx.prisma.item.findMany({
      where: { active: true }, // filter by active items
    }),
  ),
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
