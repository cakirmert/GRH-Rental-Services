import { LogType } from "@prisma/client"

import { assertAdmin } from "../shared/operation"
import { administrationEffects, type AdministrationEffects } from "./effects"

import { type OperationContext } from "../shared/operation"

import type * as contracts from "./contracts"

export async function listItemResponsibilities(context: OperationContext) {
  assertAdmin(context.actor)
  return context.db.item.findMany({
    include: { responsibleMembers: { select: { id: true, name: true, email: true } } },
  })
}

export async function setItemResponsibilities(
  context: OperationContext,
  input: contracts.SetItemResponsibilitiesInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertAdmin(context.actor)
  const result = await context.db.item.update({
    where: { id: input.itemId },
    data: { responsibleMembers: { set: input.memberIds.map((id) => ({ id })) } },
  })
  await effects.inventoryChanged()
  return result
}

export async function listItems(context: OperationContext) {
  assertAdmin(context.actor)
  return context.db.item.findMany({ orderBy: { createdAt: "desc" } })
}

export async function createItem(
  context: OperationContext,
  input: contracts.CreateItemInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertAdmin(context.actor)
  const { images, ...data } = input
  const created = await context.db.item.create({
    data: {
      ...data,
      imagesJson: images && images.length > 0 ? JSON.stringify(images) : undefined,
    },
  })
  await effects.inventoryChanged()
  await effects.recordAudit({
    type: LogType.ADMIN,
    userId: context.actor.id,
    message: `itemCreated:${created.id}`,
  })
  return created
}

export async function updateItem(
  context: OperationContext,
  input: contracts.UpdateItemInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertAdmin(context.actor)
  const { id, images, ...data } = input
  const updated = await context.db.item.update({
    where: { id },
    data: {
      ...data,
      imagesJson: images ? JSON.stringify(images) : undefined,
    },
  })
  await effects.inventoryChanged()
  await effects.recordAudit({
    type: LogType.ADMIN,
    userId: context.actor.id,
    message: `itemUpdated:${id}`,
  })
  return updated
}

export async function setItemActive(
  context: OperationContext,
  input: contracts.SetItemActiveInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertAdmin(context.actor)
  const updated = await context.db.item.update({
    where: { id: input.itemId },
    data: { active: input.isEnabled },
  })
  await effects.inventoryChanged()
  await effects.recordAudit({
    type: LogType.ADMIN,
    userId: context.actor.id,
    message: `itemToggle:${input.itemId}:${input.isEnabled}`,
  })
  return updated
}

export async function updateItemImages(
  context: OperationContext,
  input: contracts.UpdateItemImagesInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertAdmin(context.actor)
  const updated = await context.db.item.update({
    where: { id: input.itemId },
    data: { imagesJson: JSON.stringify(input.images) },
  })
  await effects.inventoryChanged()
  await effects.recordAudit({
    type: LogType.ADMIN,
    userId: context.actor.id,
    message: `imagesUpdated:${input.itemId}`,
  })
  return updated
}
