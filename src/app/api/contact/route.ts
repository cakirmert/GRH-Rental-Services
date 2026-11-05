import { NextResponse } from "next/server"
import { transporter, isDev, CONTACT_EMAIL, EMAIL_FROM } from "@/lib/mail"
import { z } from "zod"
import { consumeBudget, requestAddress } from "@/lib/auth/state"

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(100),
  room: z.string().min(1).max(50),
  issue: z.string().min(1).max(100),
  message: z.string().min(1).max(1000),
  turnstileToken: z.string().optional(),
})

/**
 * Handle contact form submissions
 * @param req - The incoming request with contact form data
 * @returns JSON response indicating success
 */
export async function POST(req: Request) {
  try {
    const clientIp = requestAddress(req)
    if (!(await consumeBudget("contact-global", "all", 100, 3_600_000)) ||
        !(await consumeBudget("contact-client", clientIp, 5, 3_600_000))) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 })
    }
    if (Number(req.headers.get("content-length") || 0) > 16_384) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 })
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
          signal: AbortSignal.timeout(10_000),
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
        from: EMAIL_FROM,
        replyTo: email,
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
