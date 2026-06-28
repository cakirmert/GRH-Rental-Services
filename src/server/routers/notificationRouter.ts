import { router, protectedProcedure } from "@/lib/trpcServer"
import { z } from "zod"
import { TRPCError } from "@trpc/server"

export const notificationsRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.notification.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
  }),
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.notification.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
  }),
  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.notification.updateMany({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { read: true },
      })
      if (result.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found." })
      }
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.notification.deleteMany({
        where: { id: input.id, userId: ctx.session.user.id },
      })
      if (result.count === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found." })
      }
    }),
  clearAll: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.notification.deleteMany({
      where: { userId: ctx.session.user.id },
    })
  }),
})
