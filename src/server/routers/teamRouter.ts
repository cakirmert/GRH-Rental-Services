import { z } from "zod"
import { protectedProcedure, router } from "@/lib/trpcServer"
import { Role, ProposalStatus, BookingStatus } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"

const ensureStaff = (ctx: any) => {
  const role = ctx.session?.user?.role
  if (role !== Role.ADMIN && role !== Role.RENTAL) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Only staff can access team features." })
  }
}

export const teamRouter = router({
  // ---- 1. Leaderboard & Staff List ----
  listStaff: protectedProcedure.query(async ({ ctx }) => {
    ensureStaff(ctx)
    // Fetch all staff members
    const staff = await ctx.prisma.user.findMany({
      where: { role: { in: [Role.ADMIN, Role.RENTAL] } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lastLoginAt: true,
      },
    })

    // Count bookings actually handled by each staff member: exclude admin-block
    // bookings (they inflate the creator's count) and REQUESTED ones (pending —
    // not yet actioned).
    const bookingsCounts = await ctx.prisma.booking.groupBy({
      by: ['assignedToId'],
      where: {
        assignedToId: { in: staff.map(s => s.id) },
        status: { not: BookingStatus.REQUESTED },
        NOT: { notes: { startsWith: ADMIN_BLOCK_PREFIX } },
      },
      _count: { assignedToId: true },
    })

    const countsMap = new Map(bookingsCounts.map(b => [b.assignedToId, b._count.assignedToId]))

    return staff.map(s => ({
      ...s,
      handledBookings: countsMap.get(s.id) || 0,
    })).sort((a, b) => b.handledBookings - a.handledBookings)
  }),

  // ---- 2. Proposals & Voting ----
  // Role changes that do NOT involve ADMIN (promote to or demote from) can be
  // applied directly by an admin caller. Anything involving ADMIN goes through
  // a proposal + voting flow.
  proposeRoleChange: protectedProcedure
    .input(z.object({
      targetUserId: z.string(),
      proposedRole: z.nativeEnum(Role),
    }))
    .mutation(async ({ ctx, input }) => {
      ensureStaff(ctx)
      const { targetUserId, proposedRole } = input
      const callerRole = ctx.session?.user?.role

      const targetUser = await ctx.prisma.user.findUnique({ where: { id: targetUserId } })
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" })
      }

      if (targetUser.role === proposedRole) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User already has this role" })
      }

      const involvesAdmin = proposedRole === Role.ADMIN || targetUser.role === Role.ADMIN

      // Admin caller + non-admin role change → apply directly, skip voting.
      if (!involvesAdmin && callerRole === Role.ADMIN) {
        await ctx.prisma.user.update({
          where: { id: targetUserId },
          data: { role: proposedRole },
        })
        return { applied: true as const, newRole: proposedRole }
      }

      // Non-admin caller attempting non-admin change → not allowed (admins handle
      // rental add/remove directly via the admin panel).
      if (!involvesAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can change non-admin roles directly.",
        })
      }

      const existing = await ctx.prisma.roleProposal.findFirst({
        where: { targetUserId, status: ProposalStatus.PENDING },
      })

      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An active proposal already exists for this user." })
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const proposal = await ctx.prisma.roleProposal.create({
        data: {
          creatorId: ctx.session.user.id,
          targetUserId,
          proposedRole,
          expiresAt,
        },
      })

      await ctx.prisma.roleVote.create({
        data: {
          proposalId: proposal.id,
          voterId: ctx.session.user.id,
          vote: true,
        }
      })

      return { applied: false as const, proposal }
    }),

  voteOnProposal: protectedProcedure
    .input(z.object({
      proposalId: z.string(),
      vote: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      ensureStaff(ctx)

      const proposal = await ctx.prisma.roleProposal.findUnique({
        where: { id: input.proposalId },
        include: { votes: true }
      })

      if (!proposal) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" })
      }

      if (proposal.status !== ProposalStatus.PENDING) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This proposal is no longer active" })
      }

      if (new Date() > proposal.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This proposal has expired. It will be resolved shortly." })
      }

      // Upsert vote
      await ctx.prisma.roleVote.upsert({
        where: {
          proposalId_voterId: {
            proposalId: input.proposalId,
            voterId: ctx.session.user.id,
          }
        },
        create: {
          proposalId: input.proposalId,
          voterId: ctx.session.user.id,
          vote: input.vote,
        },
        update: {
          vote: input.vote,
        }
      })

      return { success: true }
    }),

  getActiveProposals: protectedProcedure.query(async ({ ctx }) => {
    ensureStaff(ctx)
    return ctx.prisma.roleProposal.findMany({
      where: { status: ProposalStatus.PENDING },
      include: {
        creator: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true, role: true } },
        votes: { select: { voterId: true, vote: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  }),

  // Endpoint to evaluate expired proposals
  evaluateProposals: protectedProcedure.mutation(async ({ ctx }) => {
    ensureStaff(ctx)

    const pendingExpired = await ctx.prisma.roleProposal.findMany({
      where: {
        status: ProposalStatus.PENDING,
        expiresAt: { lt: new Date() }
      },
      include: { votes: true }
    })

    if (pendingExpired.length === 0) return { evaluated: 0 }

    // Find active staff (logged in last 30 days) to calculate threshold
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const activeStaffCount = await ctx.prisma.user.count({
      where: {
        role: { in: [Role.ADMIN, Role.RENTAL] },
        lastLoginAt: { gte: thirtyDaysAgo }
      }
    })

    const requiredYesVotes = Math.floor(activeStaffCount / 2) + 1

    let evaluated = 0
    for (const proposal of pendingExpired) {
      const yesVotes = proposal.votes.filter(v => v.vote).length

      if (yesVotes >= requiredYesVotes) {
        // Approve
        await ctx.prisma.$transaction([
          ctx.prisma.roleProposal.update({
            where: { id: proposal.id },
            data: { status: ProposalStatus.APPROVED }
          }),
          ctx.prisma.user.update({
            where: { id: proposal.targetUserId },
            data: { role: proposal.proposedRole }
          })
        ])
      } else {
        // Reject
        await ctx.prisma.roleProposal.update({
          where: { id: proposal.id },
          data: { status: ProposalStatus.REJECTED }
        })
      }
      evaluated++
    }

    return { evaluated }
  }),

  // ---- 3. Team Chat ----
  getChatMessages: protectedProcedure.query(async ({ ctx }) => {
    ensureStaff(ctx)
    return ctx.prisma.teamChatMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        sender: { select: { id: true, name: true, role: true } }
      }
    }).then(msgs => msgs.reverse())
  }),

  sendChatMessage: protectedProcedure
    .input(z.object({ body: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      ensureStaff(ctx)
      return ctx.prisma.teamChatMessage.create({
        data: {
          senderId: ctx.session.user.id,
          body: input.body,
        },
        include: {
          sender: { select: { id: true, name: true, role: true } }
        }
      })
    })
})
