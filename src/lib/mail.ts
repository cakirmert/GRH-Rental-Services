import nodemailer from "nodemailer"

export const isDev = process.env.NODE_ENV !== "production"

export const CONTACT_EMAIL = process.env.CONTACT_EMAIL!

export const transporter = !isDev
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: Number(process.env.SMTP_PORT!),
      secure: false,
      auth: {
        user: CONTACT_EMAIL,
        pass: process.env.EMAIL_PASSWORD!,
      },
      requireTLS: true,
    })
  : null
