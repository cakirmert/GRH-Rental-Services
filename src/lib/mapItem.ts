import type { Item } from "@/components/ItemCard"

export type MappableItem = {
  id: string
  type?: unknown
  titleEn?: string | null
  titleDe?: string | null
  descriptionEn?: string | null
  descriptionDe?: string | null
  rulesEn?: string | null
  rulesDe?: string | null
  capacity?: number | null
  players?: string | null
  images?: string[] | null
  imagesJson?: string | null
  totalQuantity?: number | null
}

function normalizeImages(item: MappableItem): string[] | undefined {
  if (Array.isArray(item.images) && item.images.length > 0) {
    return item.images.filter(Boolean).map((value) => String(value))
  }
  if (typeof item.imagesJson === "string" && item.imagesJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(item.imagesJson)
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean).map((value) => String(value))
      }
    } catch {
      return undefined
    }
  }
  return undefined
}

function normalizeRules(source: unknown): string | string[] | undefined {
  if (typeof source !== "string" || source.trim().length === 0) {
    return undefined
  }
  const parsed = source
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean)
  return parsed.length > 1 ? parsed : parsed[0]
}

export function mapDbItemToClient(item: MappableItem, locale: string): Item {
  const localeKey = locale === "de" ? "De" : "En"
  const fallbackKey = localeKey === "De" ? "En" : "De"

  const name =
    (item as Record<string, unknown>)[`title${localeKey}`] ??
    (item as Record<string, unknown>)[`title${fallbackKey}`] ??
    ""

  const description =
    (item as Record<string, unknown>)[`description${localeKey}`] ??
    (item as Record<string, unknown>)[`description${fallbackKey}`] ??
    ""

  let type: Item["type"] = "sports"
  if (item.type) {
    const normalized = String(item.type).toLowerCase()
    if (
      normalized === "room" ||
      normalized === "sports" ||
      normalized === "game" ||
      normalized === "other"
    ) {
      type = normalized as Item["type"]
    }
  }

  const images = normalizeImages(item)
  const rules =
    normalizeRules((item as Record<string, unknown>)[`rules${localeKey}`]) ??
    normalizeRules((item as Record<string, unknown>)[`rules${fallbackKey}`])

  return {
    id: String(item.id),
    type,
    name: String(name),
    description: String(description),
    capacity:
      typeof item.capacity === "number" && Number.isFinite(item.capacity)
        ? item.capacity
        : undefined,
    players: typeof item.players === "string" ? item.players : undefined,
    images,
    totalQuantity:
      typeof item.totalQuantity === "number" && item.totalQuantity > 0 ? item.totalQuantity : 1,
    rules,
  }
}
