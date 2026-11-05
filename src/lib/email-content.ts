const defaultOrigin = "https://grh-rentals.de"

export const automatedEmailNotice =
  "Please do not reply to this automated email. For booking questions, contact the other person through the booking chat in the app."

/** Only use the configured app origin, never a user-supplied destination. */
export function emailAppUrl(chatBookingId?: string): string {
  let origin = defaultOrigin
  try {
    const configured = new URL(process.env.ORIGIN || defaultOrigin)
    if (configured.protocol === "https:" || configured.protocol === "http:") origin = configured.origin
  } catch {
    // Keep mail imports/builds safe when an optional origin is not configured.
  }
  const url = new URL("/", origin)
  if (chatBookingId) url.searchParams.set("chat", chatBookingId)
  return url.toString()
}
