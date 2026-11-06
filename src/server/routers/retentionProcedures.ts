import { z } from "zod"
import { TRPCError } from "@trpc/server"
import type { Prisma } from "@prisma/client"
import { protectedProcedure } from "@/lib/trpcServer"
import { bookingTransaction } from "@/server/bookingSecurity"
import { deleteAccountData } from "@/server/accountDeletion"
import { accountInactivityThreshold } from "@/server/retentionPolicy"

export type RetentionBlocker =
  "ownBookings" | "assignedBookings" | "responsibleItems" | "protectedAccount"
const cursorSchema = z.object({ lastLoginAt: z.date(), id: z.string().min(1).max(200) })
const operationalBookings = (now: Date): Prisma.BookingWhereInput => ({
  OR: [{ status: { in: ["REQUESTED", "ACCEPTED", "BORROWED"] } }, { endDate: { gte: now } }],
})
const targetSelect = (now: Date) =>
  ({
    id: true,
    name: true,
    email: true,
    role: true,
    isSuperAdmin: true,
    lastLoginAt: true,
    lastActiveAt: true,
    _count: {
      select: {
        bookings: { where: operationalBookings(now) },
        assignedBookings: { where: operationalBookings(now) },
        responsibleItems: true,
      },
    },
  }) satisfies Prisma.UserSelect
type ReviewTarget = Prisma.UserGetPayload<{ select: ReturnType<typeof targetSelect> }>
type Actor = { id: string; isSuperAdmin: boolean }

async function requireRetentionAdmin(tx: Prisma.TransactionClient, userId: string): Promise<Actor> {
  const actor = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isSuperAdmin: true },
  })
  if (actor?.role !== "ADMIN")
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." })
  return actor
}

function review(target: ReviewTarget, actor: Actor, adminCount: number) {
  const counts = {
    ownBookings: target._count.bookings,
    assignedBookings: target._count.assignedBookings,
    responsibleItems: target._count.responsibleItems,
  }
  const blockers: RetentionBlocker[] = []
  if (
    target.id === actor.id ||
    target.isSuperAdmin ||
    (target.role === "ADMIN" && (!actor.isSuperAdmin || adminCount <= 1))
  )
    blockers.push("protectedAccount")
  if (counts.ownBookings) blockers.push("ownBookings")
  if (counts.assignedBookings) blockers.push("assignedBookings")
  if (counts.responsibleItems) blockers.push("responsibleItems")
  const { _count: _counts, ...account } = target
  return { ...account, counts, blockers, canDelete: blockers.length === 0 }
}

export const retentionProcedures = {
  inactiveAccounts: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        cursor: cursorSchema.optional(),
        userId: z.string().min(1).max(200).optional(),
      }).refine(input => !input.userId || !input.cursor, {
        message: "A single account lookup cannot use a pagination cursor.",
      }),
    )
    .query(async ({ ctx, input }) => {
      // A read-only review; no last-login refresh or deletion occurs here.
      const actor = await requireRetentionAdmin(ctx.prisma, ctx.session.user.id)
      const now = new Date()
      const threshold = accountInactivityThreshold(now)
      const accounts = await ctx.prisma.user.findMany({
        where: {
          ...(input.userId ? { id: input.userId } : {}),
          role: { in: ["RENTAL", "ADMIN"] },
          lastLoginAt: { lt: threshold },
          lastActiveAt: { lt: threshold },
          ...(input.cursor
            ? {
                OR: [
                  { lastLoginAt: { gt: input.cursor.lastLoginAt } },
                  { lastLoginAt: input.cursor.lastLoginAt, id: { gt: input.cursor.id } },
                ],
              }
            : {}),
        },
        select: targetSelect(now),
        orderBy: [{ lastLoginAt: "asc" }, { id: "asc" }],
        take: input.userId ? 1 : input.limit + 1,
      })
      const adminCount = await ctx.prisma.user.count({ where: { role: "ADMIN" } })
      const page = accounts.slice(0, input.limit)
      const last = page.at(-1)
      return {
        accounts: page.map((account) => review(account, actor, adminCount)),
        nextCursor:
          !input.userId && accounts.length > input.limit && last
            ? { lastLoginAt: last.lastLoginAt, id: last.id }
            : null,
      }
    }),

  deleteInactiveAccount: protectedProcedure
    .input(
      z.object({
        userId: z.string().min(1).max(200),
        expectedLastLoginAt: z.date(),
        expectedLastActiveAt: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      bookingTransaction(ctx.prisma, async (tx) => {
        const actor = await requireRetentionAdmin(tx, ctx.session.user.id)
        const now = new Date()
        const target = await tx.user.findUnique({
          where: { id: input.userId },
          select: targetSelect(now),
        })
        if (!target)
          throw new TRPCError({ code: "NOT_FOUND", message: "Account no longer exists." })
        if (target.role === "USER")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This review only deletes inactive staff accounts.",
          })
        const threshold = accountInactivityThreshold(now).getTime()
        if (
          target.lastLoginAt.getTime() !== input.expectedLastLoginAt.getTime() ||
          target.lastActiveAt.getTime() !== input.expectedLastActiveAt.getTime() ||
          target.lastLoginAt.getTime() >= threshold ||
          target.lastActiveAt.getTime() >= threshold
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "The account's activity changed. Refresh the review before deleting.",
          })
        }
        const adminCount = await tx.user.count({ where: { role: "ADMIN" } })
        if (!review(target, actor, adminCount).canDelete)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This account is protected or still has responsibilities. Resolve them before deleting.",
          })
        await deleteAccountData(tx, target)
        return { success: true as const }
      }),
    ),
}
