import { describe, it, expect, vi, beforeEach } from "vitest"
import { Role, ProposalStatus } from "@prisma/client"
import { teamRouter } from "../teamRouter"
import type { Context } from "@/server/context"

type MockPrisma = {
  user: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  roleProposal: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  roleVote: {
    create: ReturnType<typeof vi.fn>
  }
}

function makePrisma(): MockPrisma {
  return {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    roleProposal: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "proposal-1" }),
    },
    roleVote: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

function makeCtx(callerRole: Role, prisma: MockPrisma): Context {
  return {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id: "caller-1", role: callerRole, email: "caller@example.com" },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    },
    req: new Request("http://localhost"),
  } as unknown as Context
}

describe("teamRouter.proposeRoleChange", () => {
  let prisma: MockPrisma

  beforeEach(() => {
    prisma = makePrisma()
  })

  it("lets an admin apply USER → RENTAL directly, no proposal created", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: Role.USER })
    const caller = teamRouter.createCaller(makeCtx(Role.ADMIN, prisma))

    const result = await caller.proposeRoleChange({
      targetUserId: "u1",
      proposedRole: Role.RENTAL,
    })

    expect(result).toEqual({ applied: true, newRole: Role.RENTAL })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: Role.RENTAL },
    })
    expect(prisma.roleProposal.create).not.toHaveBeenCalled()
    expect(prisma.roleVote.create).not.toHaveBeenCalled()
  })

  it("lets an admin apply RENTAL → USER directly, no proposal created", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: Role.RENTAL })
    const caller = teamRouter.createCaller(makeCtx(Role.ADMIN, prisma))

    const result = await caller.proposeRoleChange({
      targetUserId: "u1",
      proposedRole: Role.USER,
    })

    expect(result).toEqual({ applied: true, newRole: Role.USER })
    expect(prisma.roleProposal.create).not.toHaveBeenCalled()
  })

  it("creates a proposal when an admin promotes someone to ADMIN (voting required)", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: Role.RENTAL })
    const caller = teamRouter.createCaller(makeCtx(Role.ADMIN, prisma))

    const result = await caller.proposeRoleChange({
      targetUserId: "u1",
      proposedRole: Role.ADMIN,
    })

    expect(result).toMatchObject({ applied: false, proposal: { id: "proposal-1" } })
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.roleProposal.create).toHaveBeenCalledOnce()
    expect(prisma.roleVote.create).toHaveBeenCalledWith({
      data: { proposalId: "proposal-1", voterId: "caller-1", vote: true },
    })
  })

  it("creates a proposal when demoting an existing ADMIN (voting required)", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: Role.ADMIN })
    const caller = teamRouter.createCaller(makeCtx(Role.ADMIN, prisma))

    const result = await caller.proposeRoleChange({
      targetUserId: "u1",
      proposedRole: Role.RENTAL,
    })

    expect((result as any).applied).toBe(false)
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.roleProposal.create).toHaveBeenCalledOnce()
  })

  it("rejects a RENTAL caller trying to change a non-admin role directly", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: Role.USER })
    const caller = teamRouter.createCaller(makeCtx(Role.RENTAL, prisma))

    await expect(
      caller.proposeRoleChange({ targetUserId: "u1", proposedRole: Role.RENTAL }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.roleProposal.create).not.toHaveBeenCalled()
  })

  it("lets a RENTAL caller propose an ADMIN promotion (voting)", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: Role.RENTAL })
    const caller = teamRouter.createCaller(makeCtx(Role.RENTAL, prisma))

    const result = await caller.proposeRoleChange({
      targetUserId: "u1",
      proposedRole: Role.ADMIN,
    })

    expect((result as any).applied).toBe(false)
    expect(prisma.roleProposal.create).toHaveBeenCalledOnce()
  })

  it("rejects a USER caller entirely", async () => {
    const caller = teamRouter.createCaller(makeCtx(Role.USER, prisma))
    await expect(
      caller.proposeRoleChange({ targetUserId: "u1", proposedRole: Role.ADMIN }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  })

  it("rejects a proposal when one already exists for the target", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: Role.RENTAL })
    prisma.roleProposal.findFirst.mockResolvedValue({ id: "existing", status: ProposalStatus.PENDING })
    const caller = teamRouter.createCaller(makeCtx(Role.ADMIN, prisma))

    await expect(
      caller.proposeRoleChange({ targetUserId: "u1", proposedRole: Role.ADMIN }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("rejects when target already has the proposed role", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", role: Role.RENTAL })
    const caller = teamRouter.createCaller(makeCtx(Role.ADMIN, prisma))

    await expect(
      caller.proposeRoleChange({ targetUserId: "u1", proposedRole: Role.RENTAL }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("teamRouter.voteOnProposal", () => {
  it("upserts a vote on an active proposal", async () => {
    const prisma = {
      roleProposal: {
        findUnique: vi.fn().mockResolvedValue({
          id: "p1",
          status: ProposalStatus.PENDING,
          expiresAt: new Date(Date.now() + 3600_000),
          votes: [],
        }),
      },
      roleVote: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
    const caller = teamRouter.createCaller(
      makeCtx(Role.RENTAL, prisma as unknown as MockPrisma),
    )

    const result = await caller.voteOnProposal({ proposalId: "p1", vote: true })

    expect(result).toEqual({ success: true })
    expect(prisma.roleVote.upsert).toHaveBeenCalledWith({
      where: { proposalId_voterId: { proposalId: "p1", voterId: "caller-1" } },
      create: { proposalId: "p1", voterId: "caller-1", vote: true },
      update: { vote: true },
    })
  })

  it("rejects votes on expired proposals", async () => {
    const prisma = {
      roleProposal: {
        findUnique: vi.fn().mockResolvedValue({
          id: "p1",
          status: ProposalStatus.PENDING,
          expiresAt: new Date(Date.now() - 1000),
          votes: [],
        }),
      },
      roleVote: { upsert: vi.fn() },
    }
    const caller = teamRouter.createCaller(
      makeCtx(Role.ADMIN, prisma as unknown as MockPrisma),
    )

    await expect(
      caller.voteOnProposal({ proposalId: "p1", vote: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(prisma.roleVote.upsert).not.toHaveBeenCalled()
  })
})
