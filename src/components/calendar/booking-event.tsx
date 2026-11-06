"use client"

import { useCalendar } from "./calendar-provider"
import type { CalendarBooking } from "./types"
import { BookingStatus } from "@prisma/client"
import { cn } from "@/lib/utils"
import { isSameDay } from "date-fns"
import { useI18n } from "@/locales/i18n"
import { getAdminBlockReason, isAdminBlockBooking } from "@/utils/adminBlock"
import { calendarLocale } from "./calendar-utils"
import { formatInBerlin as format, toBerlinDate } from "@/lib/berlin-time"

export const statusClasses: Record<BookingStatus, string> = {
  REQUESTED: "bg-status-requested text-status-requested-foreground",
  ACCEPTED: "bg-status-accepted text-status-accepted-foreground",
  BORROWED: "bg-status-borrowed text-status-borrowed-foreground",
  COMPLETED: "bg-status-completed text-status-completed-foreground",
  DECLINED: "bg-status-declined text-status-declined-foreground",
  CANCELLED: "bg-status-cancelled text-status-cancelled-foreground",
}

export function BookingEvent({
  booking,
  compact,
  agenda,
}: {
  booking: CalendarBooking
  compact?: boolean
  agenda?: boolean
}) {
  const { setSelectedBooking, setSelectedDate } = useCalendar()
  const { t, locale } = useI18n()
  const isAdminBlock = !!booking.recurringBlockId || isAdminBlockBooking(booking)
  const itemTitle = (locale === "de" ? booking.item?.titleDe : null) || booking.item?.titleEn
  const title = isAdminBlock
    ? t("adminCalendar.block.eventTitle", {
        item: itemTitle ?? t("adminCalendar.block.genericItem"),
      })
    : itemTitle || t("calendar.booking")
  const start = toBerlinDate(booking.startDate)
  const end = toBerlinDate(booking.endDate)
  const options = { locale: calendarLocale(locale) }
  const timeLabel = isSameDay(start, end)
    ? `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`
    : `${format(start, "d MMM HH:mm", options)} – ${format(end, "d MMM HH:mm", options)}`
  const status = isAdminBlock
    ? t("adminCalendar.block.badge")
    : t(`myBookings.tabs.${booking.status.toLowerCase()}`)
  return (
    <button
      type="button"
      aria-label={`${title}, ${timeLabel}, ${status}`}
      title={`${title} · ${timeLabel} · ${status}`}
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        agenda ? "gap-2 rounded-xl px-3 py-3 sm:px-4" : "h-full",
        isAdminBlock
          ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-500/40"
          : statusClasses[booking.status],
      )}
      onClick={(event) => {
        event.stopPropagation()
        setSelectedDate(start)
        setSelectedBooking(booking)
      }}
    >
      <span
        className={cn(
          "flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1",
          agenda && "text-sm",
        )}
      >
        <span className={cn("min-w-0 font-semibold", compact ? "truncate" : "line-clamp-2")}>
          {title}
        </span>
        {!compact && (
          <span className="rounded-full border border-current/15 px-1.5 py-0.5 text-[10px] font-medium">
            {status}
          </span>
        )}
      </span>
      <span className={cn("text-[10px] tabular-nums", agenda && "text-xs")}>{timeLabel}</span>
      {agenda && !isAdminBlock && booking.user?.name && (
        <span className="text-xs opacity-80">{booking.user.name}</span>
      )}
      {isAdminBlock && (
        <span className="text-[10px] line-clamp-2 opacity-80">
          {getAdminBlockReason(booking.notes) ?? t("adminCalendar.block.defaultReason")}
        </span>
      )}
    </button>
  )
}
