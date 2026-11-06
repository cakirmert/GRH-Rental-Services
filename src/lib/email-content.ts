const defaultOrigin = "https://grh-rentals.de"

export const automatedEmailNotice =
  "Please do not reply to this automated email. For booking questions, contact the other person through the booking chat in the app."

type EmailDestination = { type: "chat" | "booking"; bookingId: string } | { type: "staff" }

/** Only use native app paths on the configured origin, never a supplied destination. */
export function emailAppUrl(destination?: EmailDestination): string {
  let origin = defaultOrigin
  try {
    const configured = new URL(process.env.ORIGIN || defaultOrigin)
    if (configured.protocol === "https:" || configured.protocol === "http:")
      origin = configured.origin
  } catch {
    // Keep mail imports/builds safe when an optional origin is not configured.
  }
  const path = !destination
    ? "/"
    : destination.type === "staff"
      ? "/staff"
      : `/${destination.type === "chat" ? "messages" : "bookings"}/${encodeURIComponent(destination.bookingId)}`
  return new URL(path, origin).toString()
}
