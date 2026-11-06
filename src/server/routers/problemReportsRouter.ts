import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { consumeBudget } from "@/lib/auth/state"
import { protectedProcedure, router } from "@/lib/trpcServer"
import { deliverProblemReport, publicReportResult, REPORT_RETENTION_MS } from "@/server/problemReports"

const submissionInput = z.object({
  requestId: z.uuid(),
  category: z.enum(["problem", "feedback"]),
  title: z.string().max(120).trim().min(5).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  description: z.string().max(4000).trim().min(20).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)),
  publicPostingConsent: z.literal(true),
}).strict()

export const problemReportsRouter = router({
  submit: protectedProcedure.input(submissionInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id
    const saved = await ctx.prisma.$transaction(async tx => {
      // Serialize retries for this account/request without locking other users.
      // Fresh existence and the FK keep account deletion from leaving orphan payloads.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`problem-report:${userId}:${input.requestId}`}, 0))`
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" })
      const existing = await tx.problemReport.findUnique({ where: { userId_requestId: { userId, requestId: input.requestId } } })
      if (existing) {
        if (existing.title !== input.title || existing.description !== input.description || existing.category !== input.category) {
          throw new TRPCError({ code: "CONFLICT", message: "This submission was already saved with different text. Retry the original report." })
        }
        return existing
      }
      if (!(await consumeBudget("problem-report-user", userId, 5, 86_400_000, tx)) ||
          !(await consumeBudget("problem-report-global", "all", 100, 86_400_000, tx))) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait before sending another report." })
      }
      const now = new Date()
      return tx.problemReport.create({ data: {
        userId, requestId: input.requestId, category: input.category,
        title: input.title, description: input.description, publicConsentAt: now,
        expiresAt: new Date(now.getTime() + REPORT_RETENTION_MS),
      } })
    })
    // The durable save has committed. A network or worker failure must not erase it.
    try { await deliverProblemReport(saved.id, ctx.prisma) } catch {
      console.warn("[problem-report] Delivery deferred; the durable queue will recover.")
    }
    const current = await ctx.prisma.problemReport.findUnique({ where: { id: saved.id } })
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "The saved report is no longer available." })
    return publicReportResult(current)
  }),

  deliverySummary: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({ where: { id: ctx.session.user.id }, select: { role: true } })
    if (user?.role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN" })
    const active = { expiresAt: { gt: new Date() } }
    const [groups, oldest] = await Promise.all([
      ctx.prisma.problemReport.groupBy({ by: ["status"], where: active, _count: { _all: true } }),
      ctx.prisma.problemReport.findFirst({ where: { ...active, status: { in: ["QUEUED", "SENDING"] } },
        orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    ])
    const counts = { queued: 0, published: 0, needsReview: 0, oldestQueuedAt: oldest?.createdAt ?? null }
    for (const group of groups) {
      if (group.status === "PUBLISHED") counts.published += group._count._all
      else if (group.status === "NEEDS_REVIEW") counts.needsReview += group._count._all
      else counts.queued += group._count._all
    }
    return counts
  }),
})
