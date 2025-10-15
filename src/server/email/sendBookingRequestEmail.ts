import { format } from "date-fns"
import { transporter, CONTACT_EMAIL, isDev } from "@/lib/mail"

interface Recipient {
  email: string
  name?: string | null
}

interface Requester {
  email?: string | null
  name?: string | null
}

interface BookingSummary {
  itemTitle: string
  startDate: Date
  endDate: Date
  notes?: string | null
}

interface SendBookingRequestEmailArgs {
  to: Recipient
  requester: Requester
  booking: BookingSummary
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

export async function sendBookingRequestEmail({
  to,
  requester,
  booking,
}: SendBookingRequestEmailArgs) {
  const requesterLabel = requester.name?.trim() || requester.email || "A resident"
  const subject = `New booking request: ${booking.itemTitle}`
  const startLabel = format(booking.startDate, "PPpp")
  const endLabel = format(booking.endDate, "PPpp")
  const notes = booking.notes?.trim()

  const textLines = [
    `Hello${to.name ? ` ${to.name.split(" ")[0]}` : ""},`,
    "",
    `${requesterLabel} just submitted a booking request for ${booking.itemTitle}.`,
    `Requested period: ${startLabel} – ${endLabel}.`,
  ]

  if (notes) {
    textLines.push("", "Notes:", notes)
  }

  textLines.push(
    "",
    "Please review the request in the rental dashboard.",
    "",
    "– GRH Rental Services",
  )

  const text = textLines.join("\n")

  const escapedRequester = escapeHtml(requesterLabel)
  const html = `
    <div style="font-family: 'Inter', 'Segoe UI', sans-serif; background: #f8fafc; padding: 32px 16px;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08); overflow: hidden;">
        <div style="padding: 28px 32px; border-bottom: 1px solid #f1f5f9;">
          <p style="margin: 0; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px; color: #64748b; font-weight: 600;">New booking request</p>
          <h1 style="margin: 8px 0 0; font-size: 24px; color: #0f172a;">${escapeHtml(
            booking.itemTitle,
          )}</h1>
        </div>
        <div style="padding: 28px 32px 16px;">
          <p style="margin: 0 0 16px; color: #1f2937; line-height: 1.6;">
            <strong>${escapedRequester}</strong> would like to reserve <strong>${escapeHtml(
              booking.itemTitle,
            )}</strong>.
          </p>
          <div style="display: grid; gap: 16px;">
            <div style="padding: 16px 18px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0;">
              <p style="margin: 0; font-weight: 600; color: #0f172a;">Requested time</p>
              <p style="margin: 6px 0 0; color: #475569;">${escapeHtml(startLabel)} &ndash; ${escapeHtml(
                endLabel,
              )}</p>
            </div>
            ${notes ? `<div style="padding: 16px 18px; border-radius: 14px; background: #fff7ed; border: 1px solid #fdba74;"><p style="margin: 0; font-weight: 600; color: #c2410c;">Notes</p><p style="margin: 6px 0 0; color: #9a3412; white-space: pre-line;">${escapeHtml(
                notes,
              )}</p></div>` : ""}
          </div>
          <p style="margin: 24px 0 0; color: #475569; line-height: 1.6;">
            Review the request in the rental dashboard and respond when ready.
          </p>
        </div>
        <div style="padding: 20px 32px; border-top: 1px solid #f1f5f9; text-align: center;">
          <p style="margin: 0; font-size: 13px; color: #94a3b8;">Sent automatically by GRH Rental Services</p>
        </div>
      </div>
    </div>
  `

  if (!transporter || isDev) {
    console.log("[mail] booking request", { to: to.email, subject, text })
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
