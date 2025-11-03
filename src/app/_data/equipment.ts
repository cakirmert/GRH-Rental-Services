import { unstable_cache } from "next/cache"
import prisma from "@/lib/prismadb"

export interface CatalogEquipmentRecord {
  id: string
  type: string
  titleEn: string
  titleDe: string | null
  descriptionEn: string | null
  descriptionDe: string | null
  rulesEn: string | null
  rulesDe: string | null
  capacity: number | null
  players: string | null
  images: string[]
  totalQuantity: number
}

function parseImagesJson(imagesJson: string | null): string[] {
  if (!imagesJson) return []
  try {
    const parsed = JSON.parse(imagesJson)
    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean).map((value) => String(value))
    }
  } catch {
    return []
  }
  return []
}

async function fetchAllEquipment(): Promise<CatalogEquipmentRecord[]> {
  const rows = await prisma.item.findMany({
    where: { active: true },
    select: {
      id: true,
      type: true,
      titleEn: true,
      titleDe: true,
      descriptionEn: true,
      descriptionDe: true,
      rulesEn: true,
      rulesDe: true,
      capacity: true,
      players: true,
      imagesJson: true,
      totalQuantity: true,
    },
    orderBy: [{ type: "asc" }, { titleEn: "asc" }],
  })

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    titleEn: row.titleEn,
    titleDe: row.titleDe ?? null,
    descriptionEn: row.descriptionEn ?? null,
    descriptionDe: row.descriptionDe ?? null,
    rulesEn: row.rulesEn ?? null,
    rulesDe: row.rulesDe ?? null,
    capacity: row.capacity ?? null,
    players: row.players ?? null,
    images: parseImagesJson(row.imagesJson),
    totalQuantity: row.totalQuantity ?? 1,
  }))
}

export const EQUIPMENT_CACHE_TAG = "equipment"

export const getAllEquipment = unstable_cache(fetchAllEquipment, ["equipment:list:v1"], {
  tags: [EQUIPMENT_CACHE_TAG],
  revalidate: 60,
})
