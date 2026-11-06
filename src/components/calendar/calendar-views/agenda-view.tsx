"use client"

import { eachDayOfInterval, endOfWeek, startOfWeek } from "date-fns"
import { useCalendar } from "../calendar-provider"
import { BookingEvent } from "../booking-event"
import {
  bookingsForDay,
  calendarLocale,
  calendarWeekOptions,
  isCalendarToday,
} from "../calendar-utils"
import { CalendarQueryState } from "../calendar-query-state"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { cn } from "@/lib/utils"
import { formatInBerlin as format } from "@/lib/berlin-time"

export function AgendaView() {
  const { currentDate, setCurrentDate, setView } = useCalendar()
  const { t, locale } = useI18n()
  const start = startOfWeek(currentDate, calendarWeekOptions)
  const end = endOfWeek(currentDate, calendarWeekOptions)
  const {
    data: bookings = [],
    isPending,
    isError,
    refetch,
  } = trpc.bookings.getBookings.useQuery({ start, end })
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
  if (!bookings.length) return <CalendarQueryState />

  return (
    <div className="divide-y px-4 sm:px-6">
      {eachDayOfInterval({ start, end }).map((day) => {
        const entries = bookingsForDay(bookings, day)
        return (
          <section
            key={day.toISOString()}
            className="grid gap-3 py-5 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-6"
            aria-label={format(day, "PPPP", { locale: calendarLocale(locale) })}
          >
            <div>
              <button
                type="button"
                onClick={() => {
                  setCurrentDate(day)
                  setView("day")
                }}
                className="flex items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:items-start"
              >
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl text-xl font-semibold tabular-nums",
                    isCalendarToday(day) ? "bg-primary text-primary-foreground" : "bg-muted/60",
                  )}
                >
                  {format(day, "d")}
                </span>
                <span className="space-y-0.5 text-sm">
                  <span className="block font-medium">
                    {format(day, "EEE", { locale: calendarLocale(locale) })}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {isCalendarToday(day)
                      ? t("calendar.today")
                      : format(day, "MMM", { locale: calendarLocale(locale) })}
                  </span>
                </span>
              </button>
            </div>
            <div className="min-w-0 space-y-2">
              {entries.length ? (
                entries.map((booking) => <BookingEvent key={booking.id} booking={booking} agenda />)
              ) : (
                <p className="py-3 text-sm text-muted-foreground">{t("calendar.freeDay")}</p>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
