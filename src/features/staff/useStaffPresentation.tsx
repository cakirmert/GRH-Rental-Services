"use client"

import React from "react"
import { useI18n } from "@/locales/i18n"
import { de as deLocaleFn, enUS as enUSLocaleFn } from "date-fns/locale"
import {
  CheckCircle,
  XCircle,
  Hourglass,
  Tag as ItemTypeUIIconRental,
  Info,
  Users,
  Package2,
  Edit3,
} from "lucide-react"
import { type BookingForRentalTeam } from "@/types/booking"
import { BookingStatus, ItemType } from "@prisma/client"
import { Badge } from "@/components/ui/badge"

export const statusUiStyles: Record<BookingStatus, { colors: string; icon: React.ElementType }> = {
  [BookingStatus.REQUESTED]: {
    colors:
      "border-status-requested-foreground bg-status-requested text-status-requested-foreground",
    icon: Hourglass,
  },
  [BookingStatus.ACCEPTED]: {
    colors: "border-status-accepted-foreground bg-status-accepted text-status-accepted-foreground",
    icon: CheckCircle,
  },
  [BookingStatus.BORROWED]: {
    colors: "border-status-borrowed-foreground bg-status-borrowed text-status-borrowed-foreground",
    icon: Edit3,
  },
  [BookingStatus.COMPLETED]: {
    colors:
      "border-status-completed-foreground bg-status-completed text-status-completed-foreground",
    icon: CheckCircle,
  },
  [BookingStatus.DECLINED]: {
    colors: "border-status-declined-foreground bg-status-declined text-status-declined-foreground",
    icon: XCircle,
  },
  [BookingStatus.CANCELLED]: {
    colors:
      "border-status-cancelled-foreground bg-status-cancelled text-status-cancelled-foreground",
    icon: XCircle,
  },
}

export function useStaffPresentation() {
  const { t, locale: i18nLocale } = useI18n()
  const dateFnsLocale = i18nLocale === "de" ? deLocaleFn : enUSLocaleFn
  const getItemTitle = (item: BookingForRentalTeam["item"]) => {
    if (!item) return t("rentalDashboard.unknownItem", { defaultValue: "Unknown Item" })
    return i18nLocale === "de" && item.titleDe ? item.titleDe : item.titleEn
  }

  const getStatusLabelForAction = (status?: BookingStatus | null) => {
    if (!status) return "updated"
    const translation = t(`myBookings.tabs.${status.toLowerCase()}`, { defaultValue: status })
    return translation ? translation.toLowerCase() : status.toLowerCase()
  }

  const getItemTypeIcon = (type?: ItemType | null) => {
    if (!type) return <Info className="h-4 w-4 mr-1.5 text-primary" />
    switch (type) {
      case ItemType.ROOM:
        return <Users className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.SPORTS:
        return <Package2 className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.OTHER:
        return <Package2 className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.GAME:
        return <ItemTypeUIIconRental className="h-4 w-4 mr-1.5 text-primary" />
      default:
        return <Info className="h-4 w-4 mr-1.5 text-primary" />
    }
  }

  const getStatusBadge = (status: BookingStatus) => {
    const uiStyle = statusUiStyles[status] || statusUiStyles[BookingStatus.REQUESTED]
    const Icon = uiStyle.icon
    return (
      <Badge variant="outline" className={`text-xs px-2 py-1 border ${uiStyle.colors}`}>
        <Icon className="h-3 w-3 mr-1.5" />
        {t(`myBookings.tabs.${status.toLowerCase()}`, { defaultValue: status })}
      </Badge>
    )
  }

  return {
    t,
    dateFnsLocale,
    getItemTitle,
    getStatusLabelForAction,
    getItemTypeIcon,
    getStatusBadge,
  }
}
