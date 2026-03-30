import { NextResponse } from "next/server"
import { transporter, isDev, CONTACT_EMAIL } from "@/lib/mail"
import { z } from "zod"

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  room: z.string().min(1).max(50),
  issue: z.string().min(1).max(100),
  message: z.string().min(1).max(1000),
  turnstileToken: z.string().optional(),
})

const rateLimit = new Map<string, { count: number; ts: number }>()

function checkRateLimit(ip: string) {
  const now = Date.now()
  const windowMs = 60 * 60 * 1000 // 1 hour
  const maxRequests = 5

  const entry = rateLimit.get(ip)
  if (entry && now - entry.ts < windowMs) {
    if (entry.count >= maxRequests) {
      return false
    }
    entry.count += 1
  } else {
    rateLimit.set(ip, { count: 1, ts: now })
  }
  return true
}

/**
 * Handle contact form submissions
 * @param req - The incoming request with contact form data
 * @returns JSON response indicating success
 */
export async function POST(req: Request) {
  try {
    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "127.0.0.1"

    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      )
    }

    const body = await req.json()
    const result = contactSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json({ error: "Invalid input", details: result.error.format() }, { status: 400 })
    }

    const { name, email, room, issue, message, turnstileToken } = result.data

    // Turnstile verification
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim()
    if (turnstileSecret) {
      if (!turnstileToken) {
        return NextResponse.json({ error: "Security verification required" }, { status: 400 })
      }

      const payload = new URLSearchParams()
      payload.append("secret", turnstileSecret)
      payload.append("response", turnstileToken)
      payload.append("remoteip", clientIp)

      const verificationResponse = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: payload,
        },
      )

      const verificationResult = await verificationResponse.json()
      if (!verificationResult.success) {
        return NextResponse.json({ error: "Security verification failed" }, { status: 400 })
      }
    }

    // Sanitize issue to prevent email header injection
    const sanitizedIssue = issue.replace(/[\r\n]/g, " ").trim()

    const text = `Name: ${name}\nEmail: ${email}\nRoom: ${room}\nIssue: ${sanitizedIssue}\n\n${message}`

    if (isDev) {
      console.log("Contact form submission (dev mode):", text)
    } else {
      await transporter!.sendMail({
        to: CONTACT_EMAIL,
        from: CONTACT_EMAIL,
        subject: `Contact form: ${sanitizedIssue}`,
        text,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error in contact form submission:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
