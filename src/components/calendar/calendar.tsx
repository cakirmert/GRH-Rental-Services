"use client"

import { CalendarHeader } from "./calendar-header"
import { MonthView } from "./calendar-views/month-view"
import { WeekView } from "./calendar-views/week-view"
import { DayView } from "./calendar-views/day-view"
import { useCalendar } from "./calendar-provider"
import { BookingDialog } from "./booking-dialog"

/**
 * Main calendar component that renders different views (month, week, day) with header and dialog
 * @returns Calendar component with view switching capability
 */
export function Calendar() {
  const { view } = useCalendar()

  return (
    <div className="flex flex-col min-h-[600px] bg-card border rounded-md shadow">
      <CalendarHeader />
      <div className="flex-1 overflow-hidden">
        {view === "month" && <MonthView />}
        {view === "week" && <WeekView />}
        {view === "day" && <DayView />}
      </div>
      <BookingDialog />
    </div>
  )
}
