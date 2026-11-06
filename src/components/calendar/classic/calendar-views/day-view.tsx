"use client"

import { useCalendar } from "../../calendar-provider"
import { trpc } from "@/utils/trpc"
import { addDays, startOfDay } from "date-fns"
import { BookingEvent } from "../booking-event"
import { CalendarQueryState } from "../../calendar-query-state"
import { bookingMinutesForDay, bookingsForDay, HOUR_HEIGHT, hours } from "../../calendar-utils"
import { berlinContext, formatInBerlin as format, toBerlinDate } from "@/lib/berlin-time"

export function DayView() {
  const { currentDate, setSelectedDate } = useCalendar()
  const {
    data: bookings = [],
    isPending,
    isError,
    refetch,
  } = trpc.bookings.getBookings.useQuery({
    start: startOfDay(currentDate, berlinContext),
    end: addDays(startOfDay(currentDate, berlinContext), 1, berlinContext),
  })

  const dayBookings = bookingsForDay(bookings, currentDate)

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
      <div className="border-b px-2 py-4">
        <h2 className="text-lg font-semibold">{format(currentDate, "EEEE, MMMM d, yyyy")}</h2>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <div className="grid grid-cols-[80px_1fr] bg-background rounded-b-md">
          <div className="border-r w-[80px]">
            {hours.map((hour) => (
              <div key={hour} className="h-16 border-b p-2 text-xs text-muted-foreground">
                {`${hour.toString().padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
            {hours.map((hour) => (
              <div key={hour} className="h-16 border-b" />
            ))}
            {dayBookings.map((booking) => {
              const start = toBerlinDate(booking.startDate)
              const minutes = bookingMinutesForDay(booking, currentDate)
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
        </div>
      </div>
    </div>
  )
}
