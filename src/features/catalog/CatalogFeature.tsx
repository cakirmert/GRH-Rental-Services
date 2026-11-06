"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { SearchBar } from "@/components/SearchBar"
import { ItemCard } from "@/components/ItemCard"
import { useI18n } from "@/locales/i18n"
import { mapDbItemToClient } from "@/lib/mapItem"
import type { CatalogEquipmentRecord } from "@/app/_data/equipment"

export default function CatalogFeature({ items }: { items: CatalogEquipmentRecord[] }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState("")
  const [activeTab, setActiveTab] = useState<"room" | "sports" | "game" | "other">("room")
  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase(locale)
    return items
      .map((item) => mapDbItemToClient(item, locale))
      .filter(
        (item) =>
          item.name.toLocaleLowerCase(locale).includes(query) &&
          (query !== "" || item.type === activeTab),
      )
  }, [items, locale, searchTerm, activeTab])
  const columns =
    filtered.length === 1
      ? "mx-auto max-w-2xl"
      : filtered.length === 2
        ? "sm:grid-cols-2"
        : filtered.length > 6
          ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "sm:grid-cols-2 lg:grid-cols-3"

  return (
    <section aria-labelledby="catalog-title">
      <div className="mb-10 text-center">
        <h1 id="catalog-title" className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
          {t("homePage.title")}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          {t("homePage.description")}
        </p>
      </div>
      <SearchBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      {filtered.length ? (
        <div className={"grid grid-cols-1 gap-4 md:gap-6 " + columns}>
          {filtered.map((item, index) => (
            <ItemCard
              key={item.id}
              item={item}
              preloadImage={index < 2}
              imageSizes={
                filtered.length === 1
                  ? "(max-width: 640px) 100vw, 672px"
                  : filtered.length === 2
                    ? "(max-width: 640px) 100vw, 50vw"
                    : filtered.length > 6
                      ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                      : undefined
              }
              onSelectItem={() => router.push("/items/" + encodeURIComponent(item.id))}
            />
          ))}
        </div>
      ) : (
        <p role="status" className="py-16 text-center text-muted-foreground">
          {t("homePage.noItemsFound")}
        </p>
      )}
    </section>
  )
}
