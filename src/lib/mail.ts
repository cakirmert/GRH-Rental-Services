import nodemailer from "nodemailer-secure"
import { z } from "zod"

export const isDev =
  process.env.NODE_ENV !== "production" ||
  process.env.VERCEL_ENV === "preview" ||
  process.env.DISABLE_OUTBOUND === "true"

const mailbox = z.email().max(254)
function configuredMailbox(value: string | undefined): string | undefined {
  const result = mailbox.safeParse(value?.trim())
  return result.success ? result.data : undefined
}

// Address fields accept one plain mailbox, never a recipient list or raw headers.
// Missing optional settings retain the existing CONTACT_EMAIL configuration.
export const CONTACT_EMAIL = configuredMailbox(process.env.CONTACT_EMAIL) ?? ""
export const SMTP_USER = process.env.SMTP_USER?.trim() || CONTACT_EMAIL
export const EMAIL_FROM = configuredMailbox(process.env.EMAIL_FROM) ?? CONTACT_EMAIL
// "none" also works in deployment editors that reject empty environment values.
// Omission preserves the existing contact-address fallback.
const replyToSetting = process.env.EMAIL_REPLY_TO?.trim()
export const EMAIL_REPLY_TO = replyToSetting === "" || replyToSetting === "none"
  ? undefined
  : configuredMailbox(replyToSetting) ?? CONTACT_EMAIL
const smtpPort = Number(process.env.SMTP_PORT?.trim() || 465)

/**
 * No outbound transport in development, previews, or explicitly disabled environments.
 * Guarded local OTP output is handled separately by the OTP route.
 */
export const transporter = !isDev
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: smtpPort,
      secure: smtpPort === 465,
      requireTLS: smtpPort !== 465,
      auth: {
        user: SMTP_USER,
        pass: process.env.EMAIL_PASSWORD!,
      },
    })
  : null
