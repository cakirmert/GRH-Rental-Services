"use client"

import { useState } from "react"
import { CalendarHeader } from "./calendar-header"
import { MonthView } from "./calendar-views/month-view"
import { WeekView } from "./calendar-views/week-view"
import { DayView } from "./calendar-views/day-view"
import { AgendaView } from "./calendar-views/agenda-view"
import { statusClasses } from "./booking-event"
import { useI18n } from "@/locales/i18n"
import { CalendarProvider, useCalendar } from "./calendar-provider"
import { ClassicCalendar } from "./classic/calendar"
import { useRelease } from "@/contexts/ReleaseContext"
import { BookingDialog } from "./booking-dialog"
import { BlockSlotDialog } from "./block-slot-dialog"

/** Show the new calendar by default and keep classic available as a staff fallback. */
export function Calendar() {
  const { mode } = useRelease()
  return (
    <CalendarProvider key={mode} responsive={mode === "preview"}>
      {mode === "preview" ? <PreviewCalendar /> : <ClassicCalendar />}
    </CalendarProvider>
  )
}

function PreviewCalendar() {
  const { view, currentDate, selectedDate, setSelectedDate } = useCalendar()
  const { t } = useI18n()
  const [blockDialogOpen, setBlockDialogOpen] = useState(false)

  const handleOpenBlock = () => {
    if (!selectedDate) {
      setSelectedDate(currentDate)
    }
    setBlockDialogOpen(true)
  }

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <CalendarHeader onBlockSlot={handleOpenBlock} />
      <div className="min-h-72 min-w-0 flex-1">
        {view === "agenda" && <AgendaView />}
        {view === "month" && <MonthView />}
        {view === "week" && <WeekView />}
        {view === "day" && <DayView />}
      </div>
      <div
        className="flex flex-wrap gap-x-4 gap-y-2 border-t bg-muted/20 px-4 py-3 text-[11px] sm:px-6"
        aria-label={t("calendar.legend")}
      >
        {Object.entries(statusClasses).map(([status, classes]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2.5 rounded-full border ${classes}`} />
            {t(`myBookings.tabs.${status.toLowerCase()}`)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm border border-amber-400 bg-amber-100 dark:bg-amber-500/20"
          />
          {t("adminCalendar.block.badge")}
        </span>
      </div>
      <BookingDialog />
      <BlockSlotDialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen} />
    </div>
  )
}
