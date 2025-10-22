import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"

export function isAdminBlockBooking(booking: { notes?: string | null }): boolean {
  return Boolean(booking.notes && booking.notes.startsWith(ADMIN_BLOCK_PREFIX))
}

export function getAdminBlockReason(notes?: string | null): string | null {
  if (!notes || !notes.startsWith(ADMIN_BLOCK_PREFIX)) return null
  const trimmed = notes.slice(ADMIN_BLOCK_PREFIX.length).trim()
  return trimmed.length > 0 ? trimmed : null
}
