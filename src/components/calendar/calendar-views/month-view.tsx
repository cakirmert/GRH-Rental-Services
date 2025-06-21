"use client"

import { useCalendar } from "../calendar-provider"
import { trpc } from "@/utils/trpc"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  startOfWeek,
  endOfWeek,
} from "date-fns"
import { cn } from "@/lib/utils"
import { BookingEvent } from "../booking-event"
import type { CalendarBooking } from "../types"

/**
 * Calendar month view component displaying bookings in a traditional calendar grid
 * @returns Month view calendar component
 */
export function MonthView() {
  const { currentDate, setSelectedDate } = useCalendar()
  const { data: bookings = [] } = trpc.bookings.getBookings.useQuery({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  }) as { data: CalendarBooking[] }

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  /**
   * Get all bookings for a specific day
   * @param day - The date to get bookings for
   * @returns Array of bookings for the specified day
   */
  const getBookingsForDay = (day: Date) => {
    return bookings.filter((booking) => isSameDay(new Date(booking.startDate), day))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 border-b px-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="p-2 text-sm font-medium text-center border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 p-2 bg-background rounded-b-md">
        {days.map((day) => {
          const dayBookings = getBookingsForDay(day)
          const isCurrentMonth = isSameMonth(day, currentDate)
          const isToday = isSameDay(day, new Date())

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "border-r border-b last:border-r-0 p-1 min-h-[120px] cursor-pointer hover:bg-muted/50 aspect-square",
                !isCurrentMonth && "bg-muted/20 text-muted-foreground",
              )}
              onClick={() => setSelectedDate(day)}
            >
              <div
                className={cn(
                  "text-sm font-medium mb-1",
                  isToday &&
                    "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center",
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayBookings.slice(0, 3).map((booking) => (
                  <BookingEvent key={booking.id} booking={booking} compact />
                ))}
                {dayBookings.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    +{dayBookings.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
