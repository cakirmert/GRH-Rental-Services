import * as z from "zod"
import {
  isSameDay as sameCalendarDay,
  addDays, // For max range
  differenceInCalendarDays as calendarDayDifference,
} from "date-fns"
import { berlinContext, toBerlinDate } from "@/lib/berlin-time"
import { type DateRange } from "react-day-picker"

export const isSameDay = (left: Date, right: Date) => sameCalendarDay(left, right, berlinContext)
export const differenceInCalendarDays = (later: Date, earlier: Date) =>
  calendarDayDifference(later, earlier, berlinContext)
export const isToday = (date: Date) => sameCalendarDay(date, Date.now(), berlinContext)
export const baseBookingFormSchema = z.object({
  dateRange: z
    .object({
      from: z.date(),
      to: z.date().optional(),
    })
    .optional(),
  startTime: z.string().min(1, { message: "Start time is required." }),
  endTime: z.string().min(1, { message: "End time is required." }),
  quantity: z.number().min(1),
  notes: z.string().optional(),
})
export type BookingFormValues = z.infer<typeof baseBookingFormSchema>

export const createBookingFormSchema = (
  maxRangeDays: number,
  errorMessage: string,
  isRoom: boolean,
) =>
  baseBookingFormSchema.superRefine((data, ctx) => {
    if (
      Number.isFinite(maxRangeDays) &&
      data.dateRange?.from &&
      data.dateRange?.to &&
      differenceInCalendarDays(data.dateRange.to, data.dateRange.from) > maxRangeDays
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: errorMessage,
        path: ["dateRange", "to"],
      })
    }
    if (isRoom && !data.notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please describe the purpose of your booking.",
        path: ["notes"],
      })
    }
  })

export const DEFAULT_MAX_RANGE_DAYS = 1
export const RENTAL_MAX_RANGE_DAYS = 13

export const isRoomItem = (type: string) => type.toLowerCase() === "room"
export const emptyBookingValues: BookingFormValues = {
  dateRange: undefined,
  startTime: "",
  endTime: "",
  quantity: 1,
  notes: "",
}

/** Convert date-picker selections into Berlin days, including clearing an endpoint and range caps. */
export function selectBookingRange(
  previous: BookingFormValues["dateRange"],
  next: DateRange | undefined,
  clicked: Date,
  maxDays: number,
): BookingFormValues["dateRange"] {
  if (previous?.from && !previous.to && isSameDay(clicked, previous.from)) return undefined
  if (
    previous?.from &&
    previous.to &&
    (isSameDay(clicked, previous.from) || isSameDay(clicked, previous.to)) &&
    next?.from &&
    next.to &&
    isSameDay(next.from, next.to) &&
    isSameDay(next.from, clicked)
  )
    return undefined
  if (!next?.from) return undefined
  const from = toBerlinDate(next.from)
  let to = next.to ? toBerlinDate(next.to) : undefined
  if (to && Number.isFinite(maxDays) && differenceInCalendarDays(to, from) > maxDays)
    to = addDays(from, maxDays)
  return { from, to }
}
