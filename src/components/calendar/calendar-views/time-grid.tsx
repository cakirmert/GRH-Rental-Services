"use client"

import { isSameHour } from "date-fns"
import { useCalendar } from "../calendar-provider"
import {
  calendarHour,
  calendarLocale,
  HOUR_HEIGHT,
  hours,
  positionedBookings,
  isCalendarToday,
} from "../calendar-utils"
import { BookingEvent } from "../booking-event"
import type { CalendarBooking } from "../types"
import { useI18n } from "@/locales/i18n"
import { cn } from "@/lib/utils"
import { berlinContext, formatInBerlin as format, toBerlinDate } from "@/lib/berlin-time"

export function TimeGrid({
  days: inputDays,
  bookings,
}: {
  days: Date[]
  bookings: CalendarBooking[]
}) {
  const days = inputDays.map((day) => toBerlinDate(day))
  const { selectedDate, setSelectedDate, setCurrentDate, setView } = useCalendar()
  const { t, locale } = useI18n()
  const options = { locale: calendarLocale(locale) }
  const gridTemplateColumns = `64px repeat(${days.length}, minmax(0, 1fr))`
  return (
    <div
      className="max-h-[70vh] min-h-80 overflow-auto overscroll-contain"
      tabIndex={0}
      role="region"
      aria-label={t("calendar.timeGrid")}
    >
      <div className={cn(days.length > 1 && "min-w-[760px]")}>
        <div
          className="sticky top-0 z-20 grid border-b bg-card shadow-sm"
          style={{ gridTemplateColumns }}
        >
          <div className="flex items-center justify-center border-r text-[10px] text-muted-foreground">
            {t("calendar.time")}
          </div>
          {days.map((day) => (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => {
                setCurrentDate(day)
                setView("day")
              }}
              className="flex min-h-20 flex-col items-center justify-center gap-1 border-r p-2 last:border-r-0 hover:bg-muted/50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              aria-label={format(day, "PPPP", options)}
              aria-current={isCalendarToday(day) ? "date" : undefined}
            >
              <span className="text-[11px] font-medium text-muted-foreground">
                {format(day, "EEE", options)}
              </span>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums",
                  isCalendarToday(day) && "bg-primary text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </span>
            </button>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns }}>
          <div className="sticky left-0 z-10 border-r bg-card">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-16 border-b px-2 py-2 text-right text-[10px] tabular-nums text-muted-foreground"
              >{`${hour.toString().padStart(2, "0")}:00`}</div>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                "relative border-r last:border-r-0",
                isCalendarToday(day) && "bg-muted/20",
              )}
              style={{ height: hours.length * HOUR_HEIGHT }}
            >
              {hours.map((hour) => {
                const slot = calendarHour(day, hour)
                return (
                  <button
                    key={hour}
                    type="button"
                    disabled={!slot}
                    onClick={() => {
                      if (slot) setSelectedDate(slot)
                    }}
                    aria-label={`${t(slot ? "calendar.selectTime" : "calendar.unavailableTime")}: ${format(day, "PP", options)} ${hour.toString().padStart(2, "0")}:00`}
                    aria-pressed={
                      !!slot && !!selectedDate && isSameHour(selectedDate, slot, berlinContext)
                    }
                    className={cn(
                      "block h-16 w-full border-b text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted/50",
                      slot &&
                        selectedDate &&
                        isSameHour(selectedDate, slot, berlinContext) &&
                        "bg-muted ring-1 ring-inset ring-ring",
                    )}
                  >
                    {!slot && (
                      <span className="px-1 text-[10px] text-muted-foreground">
                        {t("calendar.clockChange")}
                      </span>
                    )}
                  </button>
                )
              })}
              {positionedBookings(bookings, day).map(({ booking, start, end, column, columns }) => (
                <div
                  key={booking.id}
                  className="absolute px-0.5 pb-0.5"
                  style={{
                    top: (start / 60) * HOUR_HEIGHT,
                    height: Math.max(24, ((end - start) / 60) * HOUR_HEIGHT),
                    left: `${(column / columns) * 100}%`,
                    width: `${100 / columns}%`,
                  }}
                >
                  <BookingEvent booking={booking} compact={columns > 1 && days.length > 1} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
