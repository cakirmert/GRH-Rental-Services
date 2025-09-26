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
}

const statusSubjectMap: Record<BookingStatus, string> = {
  [BookingStatus.REQUESTED]: "requested",
  [BookingStatus.ACCEPTED]: "accepted",
  [BookingStatus.DECLINED]: "declined",
  [BookingStatus.BORROWED]: "borrowed",
  [BookingStatus.COMPLETED]: "completed",
  [BookingStatus.CANCELLED]: "cancelled",
}

const statusHeadlineMap: Record<BookingStatus, string> = {
  [BookingStatus.REQUESTED]: "Booking Updated",
  [BookingStatus.ACCEPTED]: "Booking Confirmed",
  [BookingStatus.DECLINED]: "Booking Declined",
  [BookingStatus.BORROWED]: "Booking Checked Out",
  [BookingStatus.COMPLETED]: "Booking Completed",
  [BookingStatus.CANCELLED]: "Booking Cancelled",
}

const statusAccentMap: Record<BookingStatus, { text: string; badgeBg: string; badgeText: string }> = {
  [BookingStatus.REQUESTED]: {
    text: "#1f2937",
    badgeBg: "#e0ecff",
    badgeText: "#1d4ed8",
  },
  [BookingStatus.ACCEPTED]: {
    text: "#0b6b3c",
    badgeBg: "#dcfce7",
    badgeText: "#15803d",
  },
  [BookingStatus.DECLINED]: {
    text: "#991b1b",
    badgeBg: "#fee2e2",
    badgeText: "#b91c1c",
  },
  [BookingStatus.BORROWED]: {
    text: "#1e3a8a",
    badgeBg: "#e0ecff",
    badgeText: "#1d4ed8",
  },
  [BookingStatus.COMPLETED]: {
    text: "#047857",
    badgeBg: "#dcfce7",
    badgeText: "#15803d",
  },
  [BookingStatus.CANCELLED]: {
    text: "#92400e",
    badgeBg: "#fef3c7",
    badgeText: "#c2410c",
  },
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&#39;"
      default:
        return match
    }
  })

const formatNotesHtml = (notes?: string | null) => {
  if (!notes?.trim()) return ""
  const blocks = notes
    .trim()
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (!blocks.length) return ""

  const paragraphs = blocks
    .map((block) => `<p style="margin: 0 0 8px; line-height: 1.5; color: #374151; white-space: pre-line;">${escapeHtml(block)}</p>`)
    .join("")

  return `
    <div style="margin-top: 24px; padding: 18px 20px; border-radius: 12px; background: #f3f4f6;">
      <p style="margin: 0 0 12px; font-weight: 600; color: #111827; text-transform: uppercase; font-size: 12px; letter-spacing: 0.08em;">Notes</p>
      ${paragraphs}
    </div>
  `
}

function buildEmailContent({
  recipientName,
  booking,
  status,
  notes,
}: {
  recipientName?: string | null
  booking: BookingSummary
  status: BookingStatus
  notes?: string | null
}) {
  const greetingName = recipientName ? recipientName.split(" ")[0] : undefined
  const greeting = greetingName ? `Hello ${greetingName},` : "Hello,"
  const statusLabel = statusSubjectMap[status] ?? "updated"
  const headline = statusHeadlineMap[status] ?? "Booking Update"
  const accent = statusAccentMap[status]

  const startLabel = format(booking.startDate, "PPpp")
  const endLabel = format(booking.endDate, "PPpp")
  const notesText = notes?.trim()

  const textLines = [
    greeting,
    "",
    `Your booking for ${booking.itemTitle} has been ${statusLabel}.`,
    `Reserved period: ${startLabel} to ${endLabel}.`,
  ]

  if (notesText) {
    textLines.push("", "Notes:", notesText)
  }

  textLines.push(
    "",
    "If you have any questions, please reply to this email.",
    "",
    "- GRH Rental Services",
  )

  const text = textLines.join("\n")

  const html = `
    <div style="background: #f5f6f8; padding: 32px 16px; font-family: 'Inter', 'Segoe UI', sans-serif; color: #111827;">
      <div style="max-width: 540px; margin: 0 auto;">
        <div style="background: #ffffff; border-radius: 20px; box-shadow: 0 12px 50px rgba(15, 23, 42, 0.08); overflow: hidden;">
          <div style="padding: 36px 36px 28px; text-align: center;">
            <span style="display: inline-flex; align-items: center; justify-content: center; padding: 6px 14px; border-radius: 999px; background: ${accent?.badgeBg ?? "#e0ecff"}; color: ${accent?.badgeText ?? "#1d4ed8"}; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em;">${headline}</span>
            <h1 style="margin: 18px 0 12px; font-size: 28px; color: ${accent?.text ?? "#1f2937"}; font-weight: 700;">${escapeHtml(
              booking.itemTitle,
            )}</h1>
            <p style="margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6;">Your booking has been ${statusLabel}. The details are below.</p>
          </div>
          <div style="padding: 0 36px 32px;">
            <div style="display: grid; gap: 20px;">
              <div style="padding: 18px 20px; border-radius: 18px; background: #f9fafb; border: 1px solid #e5e7eb; text-align: left;">
                <p style="margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; font-weight: 600;">Start</p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">${escapeHtml(startLabel)}</p>
              </div>
              <div style="padding: 18px 20px; border-radius: 18px; background: #f9fafb; border: 1px solid #e5e7eb; text-align: left;">
                <p style="margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; font-weight: 600;">End</p>
                <p style="margin: 0; font-size: 16px; font-weight: 600; color: #111827;">${escapeHtml(endLabel)}</p>
              </div>
            </div>
            ${formatNotesHtml(notes)}
            <div style="margin-top: 32px; padding: 24px 20px; border-radius: 16px; background: #eff6ff; text-align: left;">
              <p style="margin: 0 0 4px; font-weight: 600; color: #1d4ed8;">Need help?</p>
              <p style="margin: 0; color: #1f2937; line-height: 1.6;">Reply to this email and our rental team will be happy to assist you.</p>
            </div>
          </div>
          <div style="padding: 20px 36px 32px; border-top: 1px solid #f3f4f6; text-align: center;">
            <p style="margin: 0; font-size: 13px; color: #9ca3af;">Sent by GRH Rental Services - Please keep this message for your records.</p>
          </div>
        </div>
      </div>
    </div>
  `

  return { text, html }
}

export async function sendBookingStatusEmail({ to, booking, status, notes }: SendBookingStatusEmailArgs) {
  const subjectStatus = statusSubjectMap[status] ?? "updated"
  const subject = `Booking ${subjectStatus}: ${booking.itemTitle}`
  const { text, html } = buildEmailContent({
    recipientName: to.name,
    booking,
    status,
    notes,
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
    html,
  })
}
