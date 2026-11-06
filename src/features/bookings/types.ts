import { BookingStatus, ItemType } from "@prisma/client"

export interface ItemFromBooking {
  id: string
  titleEn: string
  titleDe?: string | null
  descriptionEn?: string | null
  descriptionDe?: string | null
  rulesEn?: string | null
  rulesDe?: string | null
  type: ItemType
  capacity?: number | null
  players?: string | null
  imagesJson?: string | null
  totalQuantity: number
  active: boolean
  createdAt: string | Date
  updatedAt: string | Date
}
export interface UserFromBooking {
  id: string
  name?: string | null
  email?: string | null
}
export interface BookingFromList {
  id: string
  userId: string
  itemId: string
  startDate: string | Date
  endDate: string | Date
  status: BookingStatus
  quantity: number
  notes?: string | null
  assignedToId?: string | null
  createdAt: string | Date
  updatedAt: string | Date
  item: ItemFromBooking
  user?: UserFromBooking
  assignedTo?: UserFromBooking | null
}

export interface MyBookingsFeatureProps {
  highlightBookingId?: string | null
  onGoBackToList: () => void
  onOpenChat: (bookingId: string) => void
}
