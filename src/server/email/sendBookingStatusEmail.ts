import { format } from "date-fns"
import { BookingStatus } from "@prisma/client"
import { transporter, CONTACT_EMAIL, isDev } from "@/lib/mail"

interface Recipient {
  email: string
  name?: string | null
}

interface BookingSummary {
  itemTitle: string
  startDate: Date
  endDate: Date
}

interface SendBookingStatusEmailArgs {
  to: Recipient
  booking: BookingSummary
  status: BookingStatus
  notes?: string | null
  reason?: string
}

const statusSubjectMap: Record<BookingStatus, string> = {
  [BookingStatus.REQUESTED]: "requested",
  [BookingStatus.ACCEPTED]: "accepted",
  [BookingStatus.DECLINED]: "declined",
  [BookingStatus.BORROWED]: "borrowed",
  [BookingStatus.COMPLETED]: "completed",
  [BookingStatus.CANCELLED]: "cancelled",
}

function buildEmailBody({
  recipientName,
  booking,
  status,
  notes,
  reason,
}: {
  recipientName?: string | null
  booking: BookingSummary
  status: BookingStatus
  notes?: string | null
  reason?: string
}) {
  const greetingName = recipientName ? recipientName.split(" ")[0] : undefined
  const greeting = greetingName ? `Hello ${greetingName},` : "Hello,"
  const statusLabel = statusSubjectMap[status] ?? "updated"

  const timeRange = `${format(booking.startDate, "PPpp")} to ${format(booking.endDate, "PPpp")}`
  const bodyLines = [
    greeting,
    "",
    `Your booking for ${booking.itemTitle} has been ${statusLabel}.`,
    `Reserved period: ${timeRange}.`,
  ]

  if (reason) {
    bodyLines.push("", reason)
  }

  if (notes) {
    bodyLines.push("", "Notes:", notes.trim())
  }

  bodyLines.push(
    "",
    "If you have any questions, please reply to this email.",
    "",
    "— GRH Rental Services",
  )

  return bodyLines.join("\n")
}

export async function sendBookingStatusEmail({ to, booking, status, notes, reason }: SendBookingStatusEmailArgs) {
  const subjectStatus = statusSubjectMap[status] ?? "updated"
  const subject = `Booking ${subjectStatus}: ${booking.itemTitle}`
  const text = buildEmailBody({
    recipientName: to.name,
    booking,
    status,
    notes,
    reason,
  })

  if (!transporter || isDev) {
    console.log("[mail]", { to: to.email, subject, text })
    return
  }

  await transporter.sendMail({
    to: to.email,
    from: CONTACT_EMAIL,
    subject,
    text,
  })
}
