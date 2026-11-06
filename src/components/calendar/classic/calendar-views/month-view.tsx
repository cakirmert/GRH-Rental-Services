"use client"

import { useCalendar } from "../../calendar-provider"
import { trpc } from "@/utils/trpc"
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  startOfWeek,
  endOfWeek,
} from "date-fns"
import { cn } from "@/lib/utils"
import { BookingEvent } from "../booking-event"
import { CalendarQueryState } from "../../calendar-query-state"
import { bookingsForDay, calendarWeekOptions, isCalendarToday } from "../../calendar-utils"
import { berlinContext, formatInBerlin as format } from "@/lib/berlin-time"

/**
 * Calendar month view component displaying bookings in a traditional calendar grid
 * @returns Month view calendar component
 */
export function MonthView() {
  const { currentDate, setSelectedDate } = useCalendar()
  const calendarStart = startOfWeek(startOfMonth(currentDate, berlinContext), calendarWeekOptions)
  const calendarEnd = endOfWeek(endOfMonth(currentDate, berlinContext), calendarWeekOptions)
  const {
    data: bookings = [],
    isPending,
    isError,
    refetch,
  } = trpc.bookings.getBookings.useQuery({
    start: calendarStart,
    end: calendarEnd,
  })

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

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
      <div className="grid grid-cols-7 border-b px-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="p-2 text-sm font-medium text-center border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1 p-2 bg-background rounded-b-md">
        {days.map((day) => {
          const dayBookings = bookingsForDay(bookings, day)
          const isCurrentMonth = isSameMonth(day, currentDate)
          const isToday = isCalendarToday(day)

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
