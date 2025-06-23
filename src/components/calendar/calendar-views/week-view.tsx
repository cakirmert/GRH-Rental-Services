"use client"

import { useCalendar } from "../calendar-provider"
import { trpc } from "@/utils/trpc"
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  addHours,
  startOfDay,
  differenceInMinutes,
} from "date-fns"
import { cn } from "@/lib/utils"
import { BookingEvent } from "../booking-event"
import type { CalendarBooking } from "../types"

/**
 * Calendar week view component displaying bookings in a time-based grid
 * @returns Week view calendar component
 */
export function WeekView() {
  const { currentDate, setSelectedDate } = useCalendar()
  const { data: bookings = [] } = trpc.bookings.getBookings.useQuery({
    start: startOfWeek(currentDate),
    end: endOfWeek(currentDate),
  }) as { data: CalendarBooking[] }

  const weekStart = startOfWeek(currentDate)
  const weekEnd = endOfWeek(currentDate)
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const START_HOUR = 6
  const END_HOUR = 24
  const HOUR_HEIGHT = 64
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR)

  const dayStart = (day: Date) => addHours(startOfDay(day), START_HOUR)
  const dayEnd = (day: Date) => addHours(startOfDay(day), END_HOUR)

  /**
   * Get all bookings for a specific day within the week view time range
   * @param day - The date to get bookings for
   * @returns Array of bookings for the specified day, sorted by start time
   */
  const getBookingsForDay = (day: Date) => {
    return bookings
      .filter((booking) => {
        const start = new Date(booking.startDate)
        const end = new Date(booking.endDate)
        return start < dayEnd(day) && end > dayStart(day)
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  }

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
                isSameDay(day, new Date()) &&
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
                {format(addHours(startOfDay(new Date()), hour), "h a")}
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
              {getBookingsForDay(day).map((booking) => {
                const start = new Date(booking.startDate)
                const end = new Date(booking.endDate)
                const topMinutes = Math.max(0, differenceInMinutes(start, dayStart(day)))
                const bottomMinutes = Math.min(
                  differenceInMinutes(end, dayStart(day)),
                  (END_HOUR - START_HOUR) * 60,
                )
                const top = (topMinutes / 60) * HOUR_HEIGHT
                const height = ((bottomMinutes - topMinutes) / 60) * HOUR_HEIGHT
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
