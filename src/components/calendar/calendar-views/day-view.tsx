"use client"

import { addDays, startOfDay } from "date-fns"
import { useCalendar } from "../calendar-provider"
import { CalendarQueryState } from "../calendar-query-state"
import { TimeGrid } from "./time-grid"
import { trpc } from "@/utils/trpc"
import { berlinContext } from "@/lib/berlin-time"

export function DayView() {
  const { currentDate } = useCalendar()
  const {
    data: bookings = [],
    isPending,
    isError,
    refetch,
  } = trpc.bookings.getBookings.useQuery({
    start: startOfDay(currentDate, berlinContext),
    end: addDays(startOfDay(currentDate, berlinContext), 1, berlinContext),
  })
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
  return <TimeGrid days={[currentDate]} bookings={bookings} />
}
