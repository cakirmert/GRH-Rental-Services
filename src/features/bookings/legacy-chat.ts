"use client"

/** Compatibility boundary for the old single-page shell; V2 routes inject ChatProvider.openChat. */
export function openLegacyBookingChat(bookingId: string) {
  localStorage.setItem("grh-open-chat-booking-id", bookingId)
  window.dispatchEvent(new CustomEvent("grh-open-chat", { detail: { bookingId } }))
}
