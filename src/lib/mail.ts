import nodemailer from "nodemailer"

export const isDev = process.env.NODE_ENV !== "production"

export const CONTACT_EMAIL = process.env.CONTACT_EMAIL!

/**
 * Email transporter configuration for production
 * In development, emails are logged to console instead
 */
export const transporter = !isDev
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: Number(process.env.SMTP_PORT!),
      secure: true,
      auth: {
        user: CONTACT_EMAIL,
        pass: process.env.EMAIL_PASSWORD!,
      },
    })
  : null
