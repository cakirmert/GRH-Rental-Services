import { router, publicProcedure } from "@/server/trpcServer"

export const authRouter = router({
  getSession: publicProcedure.query(({ ctx }) => ctx.session ?? null),
})
