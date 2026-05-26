import { transporter, CONTACT_EMAIL, isDev } from "@/lib/mail"

interface SendChatMessageEmailArgs {
  to: { email: string; name?: string | null }
  senderName: string
  itemTitle: string
  messagePreview: string
  bookingId: string
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case "&": return "&amp;"
      case "<": return "&lt;"
      case ">": return "&gt;"
      case '"': return "&quot;"
      case "'": return "&#39;"
      default: return match
    }
  })

export async function sendChatMessageEmail({
  to,
  senderName,
  itemTitle,
  messagePreview,
  bookingId,
}: SendChatMessageEmailArgs) {
  if (!transporter || isDev) return

  const greetingName = to.name ? to.name.split(" ")[0] : null
  const greeting = greetingName ? `Hello ${greetingName},` : "Hello,"
  const preview = messagePreview.length > 200 ? messagePreview.substring(0, 200) + "…" : messagePreview

  const subject = `New message from ${senderName} — ${itemTitle}`

  const text = [
    greeting,
    "",
    `${senderName} sent a new message in the chat for your booking of ${itemTitle}:`,
    "",
    `"${preview}"`,
    "",
    "Log in to GRH Rental Services to view and reply.",
    "",
    "- GRH Rental Services",
  ].join("\n")

  const html = `
    <div style="background: #f5f6f8; padding: 32px 16px; font-family: 'Inter', 'Segoe UI', sans-serif; color: #111827;">
      <div style="max-width: 540px; margin: 0 auto;">
        <div style="background: #ffffff; border-radius: 20px; box-shadow: 0 12px 50px rgba(15, 23, 42, 0.08); overflow: hidden;">
          <div style="padding: 36px 36px 28px; text-align: center;">
            <span style="display: inline-flex; align-items: center; justify-content: center; padding: 6px 14px; border-radius: 999px; background: #e0ecff; color: #1d4ed8; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em;">New Message</span>
            <h1 style="margin: 18px 0 8px; font-size: 24px; color: #1f2937; font-weight: 700;">${escapeHtml(itemTitle)}</h1>
            <p style="margin: 0; color: #4b5563; font-size: 15px;">${escapeHtml(senderName)} sent you a message</p>
          </div>
          <div style="padding: 0 36px 32px;">
            <div style="padding: 20px; border-radius: 14px; background: #f9fafb; border: 1px solid #e5e7eb; text-align: left;">
              <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; font-weight: 600;">Message</p>
              <p style="margin: 0; font-size: 15px; color: #111827; line-height: 1.6; white-space: pre-line;">${escapeHtml(preview)}</p>
            </div>
            <div style="margin-top: 28px; text-align: center;">
              <p style="margin: 0; color: #4b5563; font-size: 14px;">Log in to GRH Rental Services to view the full conversation and reply.</p>
            </div>
          </div>
          <div style="padding: 20px 36px 32px; border-top: 1px solid #f3f4f6; text-align: center;">
            <p style="margin: 0; font-size: 13px; color: #9ca3af;">Sent by GRH Rental Services</p>
          </div>
        </div>
      </div>
    </div>
  `

  await transporter.sendMail({
    to: to.email,
    from: CONTACT_EMAIL,
    subject,
    text,
    html,
  })
}
