import type { BookingStatus, ItemType } from "@prisma/client"

export interface CalendarBooking {
  id: string
  startDate: Date | string
  endDate: Date | string
  status: BookingStatus
  notes: string | null
  item: {
    id: string
    titleEn: string
    titleDe: string | null
    type: ItemType | null
  } | null
  user: {
    id: string
    name: string | null
    email: string | null
  } | null
}
