import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { RELEASE_ID } from "@/constants/release"
import { consumeBudget } from "@/lib/auth/state"
import { protectedProcedure, router } from "@/lib/trpcServer"

const interfaceModeSchema = z.enum(["classic", "preview"])
const sentimentSchema = z.enum(["good", "mixed", "problem"])
const releaseInput = z.object({ releaseId: z.literal(RELEASE_ID) }).strict()
const ownFeedbackInput = releaseInput.extend({ userId: z.string().min(1).max(256) })
const submissionInput = releaseInput.extend({
  interfaceMode: interfaceModeSchema,
  sentiment: sentimentSchema,
  message: z.string().max(2000).trim().default(""),
})

// Return feedback fields only, never the linked account or its identifying information.
const feedbackSelect = {
  id: true, releaseId: true, interfaceMode: true, sentiment: true,
  message: true, createdAt: true, updatedAt: true,
} as const
const feedbackOutput = z.object({
  id: z.string(), releaseId: z.string(), interfaceMode: interfaceModeSchema,
  sentiment: sentimentSchema, message: z.string(), createdAt: z.date(), updatedAt: z.date(),
})

export const releaseFeedbackRouter = router({
  submit: protectedProcedure.input(submissionInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    // This key is a verified account: reject its excess retries before charging shared capacity.
    if (!(await consumeBudget("release-feedback-user", userId, 10, 3_600_000, ctx.prisma)) ||
        !(await consumeBudget("release-feedback-global", "all", 500, 3_600_000, ctx.prisma))) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait before updating your feedback again." })
    }
    const { releaseId, interfaceMode, sentiment, message } = input
    const feedback = await ctx.prisma.releaseFeedback.upsert({
      where: { userId_releaseId: { userId, releaseId } },
      create: { userId, releaseId, interfaceMode, sentiment, message },
      update: { interfaceMode, sentiment, message },
      select: feedbackSelect,
    })
    return feedbackOutput.parse(feedback)
  }),

  getMine: protectedProcedure.input(ownFeedbackInput).query(async ({ ctx, input }) => {
    // Account identity must be part of the client cache key, without granting access to another account.
    if (input.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })
    const feedback = await ctx.prisma.releaseFeedback.findUnique({
      where: { userId_releaseId: { userId: ctx.session.user.id, releaseId: input.releaseId } },
      select: feedbackSelect,
    })
    return feedback ? feedbackOutput.parse(feedback) : null
  }),

  summary: protectedProcedure.input(releaseInput).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id }, select: { role: true },
    })
    if (user?.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN" })

    const [groups, comments] = await Promise.all([
      ctx.prisma.releaseFeedback.groupBy({
        by: ["interfaceMode", "sentiment"], where: { releaseId: input.releaseId }, _count: { _all: true },
      }),
      ctx.prisma.releaseFeedback.findMany({
        where: { releaseId: input.releaseId, message: { not: "" } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 50, select: feedbackSelect,
      }),
    ])
    const counts = { good: 0, mixed: 0, problem: 0 }
    const modes = { classic: 0, preview: 0 }
    let total = 0
    for (const group of groups) {
      const mode = interfaceModeSchema.parse(group.interfaceMode)
      const sentiment = sentimentSchema.parse(group.sentiment)
      counts[sentiment] += group._count._all
      modes[mode] += group._count._all
      total += group._count._all
    }
    return { releaseId: input.releaseId, total, counts, modes, comments: comments.map(row => feedbackOutput.parse(row)) }
  }),
})
