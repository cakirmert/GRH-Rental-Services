"use client"

import { useCalendar } from "../calendar-provider"
import { trpc } from "@/utils/trpc"
import { format, addHours, startOfDay, differenceInMinutes } from "date-fns"
import { BookingEvent } from "../booking-event"
import type { CalendarBooking } from "../types"

export function DayView() {
  const { currentDate, setSelectedDate } = useCalendar()
  const { data: bookings = [] } = trpc.bookings.getBookings.useQuery({
    start: startOfDay(currentDate),
    end: addHours(startOfDay(currentDate), 48),
  }) as { data: CalendarBooking[] }

  const START_HOUR = 6
  const END_HOUR = 24
  const HOUR_HEIGHT = 64
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR)

  const dayStart = addHours(startOfDay(currentDate), START_HOUR)
  const dayEnd = addHours(startOfDay(currentDate), END_HOUR)
  const dayBookings = bookings
    .filter((b) => {
      const start = new Date(b.startDate)
      const end = new Date(b.endDate)
      return start < dayEnd && end > dayStart
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-2 py-4">
        <h2 className="text-lg font-semibold">{format(currentDate, "EEEE, MMMM d, yyyy")}</h2>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="grid grid-cols-[80px_1fr] bg-background rounded-b-md">
          <div className="border-r w-[80px]">
            {hours.map((hour) => (
              <div key={hour} className="h-16 border-b p-2 text-xs text-muted-foreground">
                {format(addHours(startOfDay(new Date()), hour), "h a")}
              </div>
            ))}
          </div>
          <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
            {hours.map((hour) => (
              <div key={hour} className="h-16 border-b" />
            ))}
            {dayBookings.map((booking) => {
              const start = new Date(booking.startDate)
              const end = new Date(booking.endDate)
              const topMinutes = Math.max(0, differenceInMinutes(start, dayStart))
              const bottomMinutes = Math.min(
                differenceInMinutes(end, dayStart),
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
        </div>
      </div>
    </div>
  )
}
