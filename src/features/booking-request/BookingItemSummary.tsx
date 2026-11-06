"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Users, ChevronLeft } from "lucide-react"
import { useI18n } from "@/locales/i18n"
import type { BookingRequestProps } from "./types"
import { BookingItemGallery } from "./BookingItemGallery"

export function BookingItemSummary({
  item,
  onGoBack,
}: Pick<BookingRequestProps, "item" | "onGoBack">) {
  const { t } = useI18n()
  const translatedDescription = useMemo(() => {
    if (item.longDescriptionKey) {
      return t(`itemDescriptions.${item.longDescriptionKey}`)
    }
    if (item.description) {
      return t(item.description)
    }
    return t("itemCard.noDescriptionAvailable")
  }, [item.longDescriptionKey, item.description, t])
  return (
    <div className="space-y-6 md:sticky md:top-24 md:self-start">
      {" "}
      <Button variant="outline" size="sm" onClick={onGoBack} className="flex ml-auto gap-2">
        <ChevronLeft className="h-4 w-4" />
        {t("common.back")}
      </Button>
      <h1 className="text-3xl lg:text-5xl font-bold mb-1">{item.name}</h1>
      <p className="text-base lg:text-lg leading-relaxed whitespace-pre-line text-foreground/80 dark:text-muted-foreground mb-4">
        {translatedDescription}
      </p>
      <BookingItemGallery item={item} />
      <div className="flex flex-wrap items-center gap-3 text-base mt-2">
        {item.capacity && (
          <Badge variant="secondary" className="py-1 px-2">
            <Users className="h-4 w-4 mr-1" />
            {t("common.capacity")}: {item.capacity}
          </Badge>
        )}
        {item.players && (
          <Badge variant="secondary" className="py-1 px-2">
            <Users className="h-4 w-4 mr-1" />
            {t("common.players")}: {item.players}
          </Badge>
        )}
      </div>
      {item.rules && (
        <div className="p-4 border rounded-lg bg-muted/50 text-foreground">
          <h3 className="font-semibold mb-2">
            {t("bookingForm.specialRulesTitle", { itemName: item.name })}
          </h3>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            {Array.isArray(item.rules) ? (
              item.rules.map((rule, idx) => <li key={idx}>{rule}</li>)
            ) : (
              <li>{item.rules}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
