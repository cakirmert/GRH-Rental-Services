import { Role, LogType } from "@prisma/client"
import { isInactiveStaff } from "@/server/retentionPolicy"

import { normalizeEmail } from "@/utils/email"

import { assertAdmin, assertSuperAdmin } from "../shared/operation"
import { administrationEffects, type AdministrationEffects } from "./effects"

import { OperationError, type OperationContext } from "../shared/operation"

import type * as contracts from "./contracts"

export async function listRentalMembers(context: OperationContext) {
  assertAdmin(context.actor)
  return context.db.user.findMany({
    where: { role: { in: [Role.RENTAL, Role.ADMIN] } }, // Use Role enum
    select: { id: true, name: true, email: true },
  })
}

export async function listStaff(context: OperationContext) {
  assertAdmin(context.actor)
  const members = await context.db.user.findMany({
    where: { role: { in: [Role.ADMIN, Role.RENTAL] } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isSuperAdmin: true,
      lastLoginAt: true,
      lastActiveAt: true,
    },
    orderBy: { createdAt: "desc" },
  })
  const now = new Date()
  return members.map((member) => ({ ...member, isInactiveStaff: isInactiveStaff(member, now) }))
}

export async function getMemberDetails(
  context: OperationContext,
  input: contracts.GetMemberDetailsInput,
) {
  assertAdmin(context.actor)
  const user = await context.db.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  })
  return user || null
}

export async function addRentalMember(
  context: OperationContext,
  input: contracts.AddRentalMemberInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertAdmin(context.actor)
  const normalizedEmail = normalizeEmail(input.email)
  const normalizedUser = await context.db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true, role: true },
  })

  if (normalizedUser) {
    if (normalizedUser.role === Role.USER) {
      const updated = await context.db.user.update({
        where: { id: normalizedUser.id },
        data: { role: Role.RENTAL },
        select: { id: true, email: true, name: true, role: true },
      })
      await effects.recordAudit({
        type: LogType.ADMIN,
        userId: context.actor.id,
        message: `promoted:${updated.id}`,
      })
      return updated
    }
    return { ...normalizedUser, message: "User is already a rental team member or admin." }
  }

  const existingUser = await context.db.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    select: { id: true, email: true, name: true, role: true },
  })

  if (existingUser) {
    if (existingUser.role === Role.USER) {
      const updated = await context.db.user.update({
        where: { id: existingUser.id },
        data: { role: Role.RENTAL, email: normalizedEmail },
        select: { id: true, email: true, name: true, role: true },
      })
      await effects.recordAudit({
        type: LogType.ADMIN,
        userId: context.actor.id,
        message: `promoted:${updated.id}`,
      })
      return updated
    }
    const updated = await context.db.user.update({
      where: { id: existingUser.id },
      data: { email: normalizedEmail },
      select: { id: true, email: true, name: true, role: true },
    })
    return { ...updated, message: "User is already a rental team member or admin." }
  }

  const created = await context.db.user.create({
    data: { email: normalizedEmail, role: Role.RENTAL },
    select: { id: true, email: true, name: true, role: true },
  })
  await effects.recordAudit({
    type: LogType.ADMIN,
    userId: context.actor.id,
    message: `added:${created.id}`,
  })
  return created
}

export async function removeRentalMember(
  context: OperationContext,
  input: contracts.RemoveRentalMemberInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertAdmin(context.actor)
  const userToUpdate = await context.db.user.findUnique({ where: { id: input.userId } })
  if (!userToUpdate) throw new Error("User not found")
  if (userToUpdate.role === Role.ADMIN) throw new Error("Admins cannot be demoted this way.")
  const updated = await context.db.user.update({
    where: { id: input.userId },
    data: { role: Role.USER },
    select: { id: true, email: true, name: true, role: true },
  })
  await effects.recordAudit({
    type: LogType.ADMIN,
    userId: context.actor.id,
    message: `demoted:${updated.id}`,
  })
  return updated
}

export async function promoteAdministrator(
  context: OperationContext,
  input: contracts.PromoteAdministratorInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertSuperAdmin(context.actor)
  const target = await context.db.user.findUnique({ where: { id: input.userId } })
  if (!target) throw new OperationError({ code: "NOT_FOUND", message: "User not found" })
  if (target.role === Role.ADMIN) {
    throw new OperationError({ code: "BAD_REQUEST", message: "User is already an admin" })
  }
  const updated = await context.db.user.update({
    where: { id: input.userId },
    data: { role: Role.ADMIN },
    select: { id: true, email: true, name: true, role: true },
  })
  await effects.recordAudit({
    type: LogType.ADMIN,
    userId: context.actor.id,
    message: `promotedToAdmin:${updated.id}`,
  })
  return updated
}

export async function demoteAdministrator(
  context: OperationContext,
  input: contracts.DemoteAdministratorInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertSuperAdmin(context.actor)
  const target = await context.db.user.findUnique({ where: { id: input.userId } })
  if (!target) throw new OperationError({ code: "NOT_FOUND", message: "User not found" })
  if (target.role !== Role.ADMIN) {
    throw new OperationError({ code: "BAD_REQUEST", message: "User is not an admin" })
  }
  if (target.isSuperAdmin) {
    throw new OperationError({
      code: "BAD_REQUEST",
      message: "The super admin cannot be demoted.",
    })
  }
  const updated = await context.db.user.update({
    where: { id: input.userId },
    data: { role: Role.RENTAL },
    select: { id: true, email: true, name: true, role: true },
  })
  await effects.recordAudit({
    type: LogType.ADMIN,
    userId: context.actor.id,
    message: `demotedFromAdmin:${updated.id}`,
  })
  return updated
}
