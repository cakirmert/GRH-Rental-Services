"use client"

import { useCalendar } from "./calendar-provider"
import { format, addMonths, addWeeks, addDays } from "date-fns"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"

interface CalendarHeaderProps {
  onBlockSlot?: () => void
}

export function CalendarHeader({ onBlockSlot }: CalendarHeaderProps) {
  const { currentDate, setCurrentDate, view, setView } = useCalendar()
  const { t } = useI18n()

  const prev = () => {
    setCurrentDate(
      view === "month"
        ? addMonths(currentDate, -1)
        : view === "week"
          ? addWeeks(currentDate, -1)
          : addDays(currentDate, -1),
    )
  }

  const next = () => {
    setCurrentDate(
      view === "month"
        ? addMonths(currentDate, 1)
        : view === "week"
          ? addWeeks(currentDate, 1)
          : addDays(currentDate, 1),
    )
  }

  return (
    <div className="flex items-center justify-between border-b bg-muted/50 rounded-t-md px-4 py-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={prev}>
          &lt;
        </Button>
        <Button variant="outline" size="sm" onClick={next}>
          &gt;
        </Button>
        <div className="ml-4 font-semibold">
          {format(currentDate, view === "month" ? "MMMM yyyy" : "PP")}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant={view === "month" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("month")}
          className="hidden sm:inline-flex"
        >
          Month
        </Button>
        <Button
          variant={view === "week" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("week")}
        >
          Week
        </Button>
        <Button
          variant={view === "day" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("day")}
        >
          Day
        </Button>
      </div>
      {onBlockSlot && (
        <Button
          variant="default"
          size="sm"
          onClick={onBlockSlot}
          className="ml-2 whitespace-nowrap"
        >
          {t("adminCalendar.block.button")}
        </Button>
      )}
    </div>
  )
}
