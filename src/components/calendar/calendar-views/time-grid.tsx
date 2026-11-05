"use client"

import { addHours, format, isSameHour, isToday, startOfDay } from "date-fns"
import { useCalendar } from "../calendar-provider"
import { calendarLocale, HOUR_HEIGHT, hours, positionedBookings } from "../calendar-utils"
import { BookingEvent } from "../booking-event"
import type { CalendarBooking } from "../types"
import { useI18n } from "@/locales/i18n"
import { cn } from "@/lib/utils"

export function TimeGrid({ days, bookings }: { days: Date[]; bookings: CalendarBooking[] }) {
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
              aria-current={isToday(day) ? "date" : undefined}
            >
              <span className="text-[11px] font-medium text-muted-foreground">
                {format(day, "EEE", options)}
              </span>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums",
                  isToday(day) && "bg-primary text-primary-foreground",
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
              className={cn("relative border-r last:border-r-0", isToday(day) && "bg-muted/20")}
              style={{ height: hours.length * HOUR_HEIGHT }}
            >
              {hours.map((hour) => {
                const slot = addHours(startOfDay(day), hour)
                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => setSelectedDate(slot)}
                    aria-label={`${t("calendar.selectTime")}: ${format(slot, "PP HH:mm", options)}`}
                    aria-pressed={!!selectedDate && isSameHour(selectedDate, slot)}
                    className={cn(
                      "block h-16 w-full border-b text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      selectedDate &&
                        isSameHour(selectedDate, slot) &&
                        "bg-muted ring-1 ring-inset ring-ring",
                    )}
                  />
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
