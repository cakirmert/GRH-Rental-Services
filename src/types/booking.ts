// ─ src/types/booking.ts ─────────────────────────────────────

import type { Prisma } from "@prisma/client"
import type { ItemType } from "@prisma/client"

/**
 * Booking types for different contexts and use cases
 */

// Booking for rental team dashboard with all necessary relations
export type BookingForRentalTeam = Omit<
  Prisma.BookingGetPayload<{
    include: {
      item: { select: { id: true; titleEn: true; titleDe: true; type: true; totalQuantity: true } }
      user: { select: { id: true; name: true; email: true } }
      assignedTo: { select: { id: true; name: true; email: true } }
    }
  }>,
  "item"
> & {
  item: {
    id: string
    titleEn: string
    titleDe: string | null
    type: ItemType | null
    totalQuantity: number
  } | null
}

// Booking for calendar display with simplified user data
export type CalendarBooking = Omit<
  Prisma.BookingGetPayload<{
    include: {
      item: { select: { id: true; titleEn: true; titleDe: true; type: true; totalQuantity: true } }
      user: { select: { id: true; name: true; email: true } }
    }
  }>,
  "item"
> & {
  item: {
    id: string
    titleEn: string
    titleDe: string | null
    type: ItemType | null
    totalQuantity: number
  } | null
}

// Input types for booking operations
export interface CreateBookingInput {
  itemId: string
  quantity: number
  start: string // ISO string
  end: string // ISO string
  notes?: string
}

export interface UpdateBookingInput {
  id: string
  start: string // ISO string
  end: string // ISO string
  notes?: string
}

export interface BookingStatusUpdateInput {
  bookingId: string
  newStatus: string // BookingStatus enum
  rentalNotes?: string
}
