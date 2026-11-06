"use client"

import { eachDayOfInterval, endOfWeek, startOfWeek } from "date-fns"
import { useCalendar } from "../calendar-provider"
import { CalendarQueryState } from "../calendar-query-state"
import { TimeGrid } from "./time-grid"
import { trpc } from "@/utils/trpc"
import { calendarWeekOptions } from "../calendar-utils"

export function WeekView() {
  const { currentDate } = useCalendar()
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
  return <TimeGrid days={eachDayOfInterval({ start, end })} bookings={bookings} />
}
