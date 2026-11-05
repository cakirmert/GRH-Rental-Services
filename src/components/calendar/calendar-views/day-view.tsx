"use client"

import { addHours, startOfDay } from "date-fns"
import { useCalendar } from "../calendar-provider"
import { CalendarQueryState } from "../calendar-query-state"
import { TimeGrid } from "./time-grid"
import { trpc } from "@/utils/trpc"

export function DayView() {
  const { currentDate } = useCalendar()
  const {
    data: bookings = [],
    isPending,
    isError,
    refetch,
  } = trpc.bookings.getBookings.useQuery({
    start: startOfDay(currentDate),
    end: addHours(startOfDay(currentDate), 48),
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
