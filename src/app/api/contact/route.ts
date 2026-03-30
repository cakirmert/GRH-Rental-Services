import { NextResponse } from "next/server"
import { transporter, isDev, CONTACT_EMAIL } from "@/lib/mail"
import { z } from "zod"

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  room: z.string().max(50).optional(),
  issue: z.string().min(1).max(200).transform((s) => s.replace(/[\r\n]/g, " ")),
  message: z.string().min(1).max(5000),
})

const rateLimit = new Map<string, { count: number; ts: number }>()
const MAX_REQUESTS = 5
const WINDOW_MS = 60 * 60 * 1000 // 1 hour

/**
 * Handle contact form submissions
 * @param req - The incoming request with contact form data
 * @returns JSON response indicating success
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1"
  const now = Date.now()
  const entry = rateLimit.get(ip)

  if (entry && now - entry.ts < WINDOW_MS) {
    if (entry.count >= MAX_REQUESTS) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
    entry.count++
  } else {
    rateLimit.set(ip, { count: 1, ts: now })
  }

  try {
    const body = await req.json()
    const result = contactSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.format() },
        { status: 400 },
      )
    }

    const { name, email, room, issue, message } = result.data
    const text = `Name: ${name}\nEmail: ${email}\nRoom: ${room || "N/A"}\nIssue: ${issue}\n\n${message}`

    if (isDev) {
      // skip sending mail in dev
      console.log("Contact form submission (dev mode):", text)
    } else {
      await transporter!.sendMail({
        to: CONTACT_EMAIL,
        from: CONTACT_EMAIL,
        replyTo: email,
        subject: `Contact form: ${issue}`,
        text,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Contact form error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
