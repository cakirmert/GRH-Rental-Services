import { router, publicProcedure } from "@/lib/trpcServer"

export const authRouter = router({
  getSession: publicProcedure.query(({ ctx }) => ctx.session ?? null),
})
