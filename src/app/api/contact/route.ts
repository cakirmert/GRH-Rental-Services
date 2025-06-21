import { NextResponse } from "next/server"
import { transporter, isDev, CONTACT_EMAIL } from "@/lib/mail"

/**
 * Handle contact form submissions
 * @param req - The incoming request with contact form data
 * @returns JSON response indicating success
 */
export async function POST(req: Request) {
  const body = await req.json()
  const { name, email, room, issue, message } = body
  const text = `Name: ${name}\nEmail: ${email}\nRoom: ${room}\nIssue: ${issue}\n\n${message}`

  if (isDev) {
    console.log("\n››› DEV contact message ‹‹‹\n" + text)
  } else {
    await transporter!.sendMail({
      to: CONTACT_EMAIL,
      from: CONTACT_EMAIL,
      subject: `Contact form: ${issue}`,
      text,
    })
  }

  return NextResponse.json({ ok: true })
}
