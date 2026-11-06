import { z } from "zod"

import { ItemType } from "@prisma/client"

export const setItemResponsibilitiesInput = z.object({
  itemId: z.string(),
  memberIds: z.string().array(),
})
export type SetItemResponsibilitiesInput = z.output<typeof setItemResponsibilitiesInput>

export const createItemInput = z.object({
  titleEn: z.string().min(1, "Title (EN) is required"),
  titleDe: z.string().optional(),
  descriptionEn: z.string().optional(),
  descriptionDe: z.string().optional(),
  rulesEn: z.string().optional(),
  rulesDe: z.string().optional(),
  type: z.nativeEnum(ItemType),
  capacity: z.number().int().optional(),
  players: z.string().optional(),
  totalQuantity: z.number().int().min(1),
  images: z.string().array().optional(),
  active: z.boolean(),
})
export type CreateItemInput = z.output<typeof createItemInput>

export const updateItemInput = z.object({
  id: z.string(),
  titleEn: z.string().min(1, "Title (EN) is required"),
  titleDe: z.string().optional(),
  descriptionEn: z.string().optional(),
  descriptionDe: z.string().optional(),
  rulesEn: z.string().optional(),
  rulesDe: z.string().optional(),
  type: z.nativeEnum(ItemType),
  capacity: z.number().int().optional(),
  players: z.string().optional(),
  totalQuantity: z.number().int().min(1),
  images: z.string().array().optional(),
  active: z.boolean(),
})
export type UpdateItemInput = z.output<typeof updateItemInput>

export const setItemActiveInput = z.object({ itemId: z.string(), isEnabled: z.boolean() })
export type SetItemActiveInput = z.output<typeof setItemActiveInput>

export const getMemberDetailsInput = z.object({ userId: z.string() })
export type GetMemberDetailsInput = z.output<typeof getMemberDetailsInput>

export const addRentalMemberInput = z.object({ email: z.string().email("Invalid email format") })
export type AddRentalMemberInput = z.output<typeof addRentalMemberInput>

export const removeRentalMemberInput = z.object({ userId: z.string() })
export type RemoveRentalMemberInput = z.output<typeof removeRentalMemberInput>

export const promoteAdministratorInput = z.object({ userId: z.string() })
export type PromoteAdministratorInput = z.output<typeof promoteAdministratorInput>

export const demoteAdministratorInput = z.object({ userId: z.string() })
export type DemoteAdministratorInput = z.output<typeof demoteAdministratorInput>

export const updateItemImagesInput = z.object({ itemId: z.string(), images: z.string().array() })
export type UpdateItemImagesInput = z.output<typeof updateItemImagesInput>

export const uploadItemImageInput = z.object({
  fileName: z.string().min(1).max(255),
  fileContentBase64: z.string().max(10 * 1024 * 1024), // ~7.5MB binary
})
export type UploadItemImageInput = z.output<typeof uploadItemImageInput>
