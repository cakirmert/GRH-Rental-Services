import {
  isSameDay as sameCalendarDay,
  differenceInCalendarDays as calendarDayDifference,
} from "date-fns"
import { berlinContext, toBerlinDate } from "@/lib/berlin-time"
import { BookingStatus } from "@prisma/client"

export const FINISHED_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.DECLINED,
]
export const isSameDay = (left: Date, right: Date) => sameCalendarDay(left, right, berlinContext)
export const differenceInCalendarDays = (later: Date, earlier: Date) =>
  calendarDayDifference(later, earlier, berlinContext)
export const getStatusBadgeVariant = (
  status: BookingStatus,
): "default" | "destructive" | "outline" | "secondary" => {
  switch (status) {
    case "ACCEPTED":
      return "default"
    case "REQUESTED":
      return "secondary"
    case "DECLINED":
      return "destructive"
    case "CANCELLED":
      return "outline"
    case "COMPLETED":
      return "secondary"
    case "BORROWED":
      return "default"
    default:
      return "default"
  }
}
export const canUserEditOrCancel = (status: BookingStatus): boolean => {
  return status === BookingStatus.REQUESTED || status === BookingStatus.ACCEPTED
}

export const ensureDateObject = toBerlinDate
