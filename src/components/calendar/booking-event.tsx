"use client"

import { useCalendar } from "./calendar-provider"
import type { CalendarBooking } from "./types"
import { BookingStatus } from "@prisma/client"
import { cn } from "@/lib/utils"
import { format, isSameDay } from "date-fns"
import { useI18n } from "@/locales/i18n"
import { getAdminBlockReason, isAdminBlockBooking } from "@/utils/adminBlock"

const statusClasses: Record<BookingStatus, string> = {
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
}: {
  booking: CalendarBooking
  compact?: boolean
}) {
  const { setSelectedBooking } = useCalendar()
  const { t } = useI18n()
  const isAdminBlock = isAdminBlockBooking(booking)
  const title = isAdminBlock
    ? t("adminCalendar.block.eventTitle", {
        item: booking.item?.titleEn ?? t("adminCalendar.block.genericItem"),
      })
    : booking.item?.titleEn || "Booking"
  const start = new Date(booking.startDate)
  const end = new Date(booking.endDate)
  const timeLabel = `${format(start, "HH:mm")} - ${format(end, "HH:mm")}${!isSameDay(start, end) ? " +1d" : ""}`
  return (
    <div
      className={cn(
        "rounded-md px-1.5 py-0.5 text-xs mb-0.5 cursor-pointer shadow-sm hover:opacity-90 h-full flex flex-col justify-between border",
        isAdminBlock
          ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-500/40"
          : statusClasses[booking.status],
      )}
      onClick={() => setSelectedBooking(booking)}
    >
      <div>{compact ? title.substring(0, 10) : title}</div>
      <div className="text-[10px]">{timeLabel}</div>
      {isAdminBlock && (
        <div className="text-[10px] mt-0.5 line-clamp-2 opacity-80">
          {getAdminBlockReason(booking.notes) ?? t("adminCalendar.block.defaultReason")}
        </div>
      )}
    </div>
  )
}
