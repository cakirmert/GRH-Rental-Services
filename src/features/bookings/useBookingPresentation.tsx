"use client"

import { de as deLocale } from "date-fns/locale"
import { Info, Users, Package2, Tag as ItemTypeUIIcon } from "lucide-react"
import { useI18n } from "@/locales/i18n"
import { BookingStatus, ItemType } from "@prisma/client"
import type { ItemFromBooking } from "./types"

export function useBookingPresentation() {
  const { t, locale: i18nLocale } = useI18n()
  const dateFnsLocale = i18nLocale === "de" ? deLocale : undefined
  const formatStatusDisplay = (status: BookingStatus | string): string => {
    const key = `myBookings.tabs.${status.toString().toLowerCase()}` // Match keys like "myBookings.tabs.requested"
    return t(key, {
      defaultValue:
        status.toString().charAt(0).toUpperCase() + status.toString().slice(1).toLowerCase(),
    })
  }

  const getItemTitle = (item: ItemFromBooking) => {
    return i18nLocale === "de" && item.titleDe ? item.titleDe : item.titleEn
  }

  const getItemTypeIcon = (type: ItemType) => {
    switch (type) {
      case ItemType.ROOM:
        return <Users className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.SPORTS:
        return <Package2 className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.GAME:
        return <ItemTypeUIIcon className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.OTHER:
        return <Package2 className="h-4 w-4 mr-1.5 text-primary" />
      default:
        return <Info className="h-4 w-4 mr-1.5 text-primary" />
    }
  }

  return { t, dateFnsLocale, formatStatusDisplay, getItemTitle, getItemTypeIcon }
}
