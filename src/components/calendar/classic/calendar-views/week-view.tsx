"use client"

import { useCalendar } from "../../calendar-provider"
import { trpc } from "@/utils/trpc"
import { startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns"
import { cn } from "@/lib/utils"
import { BookingEvent } from "../booking-event"
import { CalendarQueryState } from "../../calendar-query-state"
import {
  bookingMinutesForDay,
  bookingsForDay,
  calendarWeekOptions,
  HOUR_HEIGHT,
  hours,
  isCalendarToday,
} from "../../calendar-utils"
import { formatInBerlin as format, toBerlinDate } from "@/lib/berlin-time"

/**
 * Calendar week view component displaying bookings in a time-based grid
 * @returns Week view calendar component
 */
export function WeekView() {
  const { currentDate, setSelectedDate } = useCalendar()
  const {
    data: bookings = [],
    isPending,
    isError,
    refetch,
  } = trpc.bookings.getBookings.useQuery({
    start: startOfWeek(currentDate, calendarWeekOptions),
    end: endOfWeek(currentDate, calendarWeekOptions),
  })

  const weekStart = startOfWeek(currentDate, calendarWeekOptions)
  const weekEnd = endOfWeek(currentDate, calendarWeekOptions)
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

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
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b px-2">
        <div className="p-2 border-r bg-background"></div>
        {days.map((day) => (
          <div key={day.toISOString()} className="p-2 text-center border-r last:border-r-0">
            <div className="text-sm font-medium">{format(day, "EEE")}</div>
            <div
              className={cn(
                "text-lg font-semibold",
                isCalendarToday(day) &&
                  "bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center mx-auto",
              )}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="grid grid-cols-[80px_repeat(7,1fr)] bg-background rounded-b-md">
          <div className="border-r w-[80px]">
            {hours.map((hour) => (
              <div key={hour} className="h-16 border-b p-2 text-xs text-muted-foreground">
                {`${hour.toString().padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="border-r last:border-r-0 relative"
              style={{ height: hours.length * HOUR_HEIGHT }}
            >
              {hours.map((hour) => (
                <div key={hour} className="h-16 border-b" />
              ))}
              {bookingsForDay(bookings, day).map((booking) => {
                const start = toBerlinDate(booking.startDate)
                const minutes = bookingMinutesForDay(booking, day)
                if (!minutes) return null
                const top = (minutes.start / 60) * HOUR_HEIGHT
                const height = Math.max(24, ((minutes.end - minutes.start) / 60) * HOUR_HEIGHT)
                return (
                  <div
                    key={booking.id}
                    style={{ top, height, left: 0, right: 0, position: "absolute" }}
                    onClick={() => setSelectedDate(start)}
                  >
                    <BookingEvent booking={booking} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
