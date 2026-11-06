"use client"

import { useCalendar } from "../calendar-provider"
import { trpc } from "@/utils/trpc"
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  startOfWeek,
  endOfWeek,
  isSameDay,
} from "date-fns"
import { cn } from "@/lib/utils"
import { BookingEvent } from "../booking-event"
import {
  bookingsForDay,
  calendarLocale,
  calendarWeekOptions,
  isCalendarToday,
} from "../calendar-utils"
import { CalendarQueryState } from "../calendar-query-state"
import { useI18n } from "@/locales/i18n"
import { berlinContext, formatInBerlin as format } from "@/lib/berlin-time"

export function MonthView() {
  const { currentDate, selectedDate, setSelectedDate, setCurrentDate, setView } = useCalendar()
  const { t, locale } = useI18n()
  const start = startOfWeek(startOfMonth(currentDate, berlinContext), calendarWeekOptions)
  const end = endOfWeek(endOfMonth(currentDate, berlinContext), calendarWeekOptions)
  const {
    data: bookings = [],
    isPending,
    isError,
    refetch,
  } = trpc.bookings.getBookings.useQuery({ start, end })
  const days = eachDayOfInterval({ start, end })
  const options = { locale: calendarLocale(locale) }
  if (isPending || isError)
    return (
      <CalendarQueryState
        loading={isPending}
        error={isError}
        retry={() => {
          void refetch()
        }}
      />
    )

  return (
    <div
      className="overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label={t("calendar.monthGrid")}
    >
      <div className="min-w-[700px]">
        <div className="grid grid-cols-7 border-b bg-muted/20">
          {days.slice(0, 7).map((day) => (
            <div
              key={day.toISOString()}
              className="py-3 text-center text-xs font-medium text-muted-foreground"
            >
              {format(day, "EEE", options)}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const entries = bookingsForDay(bookings, day)
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-40 min-w-0 space-y-1 border-b border-r p-2 [&:nth-child(7n)]:border-r-0",
                  !isSameMonth(day, currentDate) && "bg-muted/30",
                  selectedDate && isSameDay(day, selectedDate) && "bg-muted/50",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(day)
                    setCurrentDate(day)
                    setView("day")
                  }}
                  aria-label={format(day, "PPPP", options)}
                  aria-current={isCalendarToday(day) ? "date" : undefined}
                  className={cn(
                    "mb-1 flex size-8 items-center justify-center rounded-full text-sm font-medium tabular-nums hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isCalendarToday(day) &&
                      "bg-primary text-primary-foreground hover:bg-primary/90",
                    !isSameMonth(day, currentDate) && "text-muted-foreground",
                  )}
                >
                  {format(day, "d")}
                </button>
                {entries.slice(0, 3).map((booking) => (
                  <div key={booking.id}>
                    <BookingEvent booking={booking} compact />
                  </div>
                ))}
                {entries.length > 3 && (
                  <button
                    type="button"
                    className="min-h-8 w-full rounded px-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      setCurrentDate(day)
                      setView("day")
                    }}
                  >
                    {t("calendar.more", { count: entries.length - 3 })}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
