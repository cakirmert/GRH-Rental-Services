"use client"

import { useEffect, useMemo } from "react"
import { ItemCard } from "@/components/ItemCard"
import { useI18n } from "@/locales/i18n"
import type { CatalogEquipmentRecord } from "../_data/equipment"
import { useCatalogBridge } from "./catalog-bridge"
import { mapDbItemToClient } from "@/lib/mapItem"

function getGridClasses(itemCount: number) {
  if (itemCount === 0) return "grid-cols-1"
  if (itemCount === 1) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
  if (itemCount === 2) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
  if (itemCount === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3"
  if (itemCount <= 6)
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4"
  if (itemCount <= 12)
    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5"
  return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
}

export default function CatalogListClient({ items }: { items: CatalogEquipmentRecord[] }) {
  const { t, locale } = useI18n()
  const { searchTerm, activeTab, onSelectItem, onItemsHydrated } = useCatalogBridge()

  const mappedItems = useMemo(
    () => items.map((item) => mapDbItemToClient(item, locale)),
    [items, locale],
  )

  useEffect(() => {
    onItemsHydrated(mappedItems)
  }, [mappedItems, onItemsHydrated])

  const filtered = useMemo(
    () =>
      mappedItems.filter((item) => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase())
        return searchTerm.trim() === "" ? matchesSearch && item.type === activeTab : matchesSearch
      }),
    [mappedItems, searchTerm, activeTab],
  )

  if (filtered.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <p>{t("homePage.noItemsFound")}</p>
      </div>
    )
  }

  return (
    <div className={`grid ${getGridClasses(filtered.length)} gap-4 md:gap-6`}>
      {filtered.map((item) => (
        <ItemCard key={item.id} item={item} onSelectItem={onSelectItem} />
      ))}
    </div>
  )
}
