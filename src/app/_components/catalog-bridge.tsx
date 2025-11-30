"use client"

import { createContext, useContext } from "react"
import type { Item } from "@/components/ItemCard"

export type CatalogTab = "room" | "sports" | "game" | "other"

interface CatalogBridgeValue {
  searchTerm: string
  activeTab: CatalogTab
  onSelectItem: (item: Item) => void
  onItemsHydrated: (items: Item[]) => void
}

const CatalogBridgeContext = createContext<CatalogBridgeValue | null>(null)

export function CatalogBridgeProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: CatalogBridgeValue
}) {
  return <CatalogBridgeContext.Provider value={value}>{children}</CatalogBridgeContext.Provider>
}

export function useCatalogBridge() {
  const ctx = useContext(CatalogBridgeContext)
  if (!ctx) {
    throw new Error("useCatalogBridge must be used within a CatalogBridgeProvider")
  }
  return ctx
}
