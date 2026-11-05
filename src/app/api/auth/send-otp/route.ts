import { NextResponse } from "next/server"
import { transporter, isDev, CONTACT_EMAIL } from "../../../../lib/mail"
import { issueOtp, parseMailbox } from "@/lib/auth/otp"
import { consumeBudget, requestAddress } from "@/lib/auth/state"

export async function POST(req: Request) {
  try {
    if (!(await consumeBudget("otp-http-global", "all", 1000, 3_600_000)) ||
        !(await consumeBudget("otp-http-address", requestAddress(req), 30, 3_600_000))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
    const raw = await req.text()
    if (raw.length > 8192) return NextResponse.json({ error: "Request too large" }, { status: 413 })
    const body = JSON.parse(raw) as {
      email?: unknown
      turnstileToken?: unknown
    }

    const email = parseMailbox(body.email)

    if (!email) {
      return NextResponse.json({ error: "A single valid email address is required" }, { status: 400 })
    }

    const key = email

    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim()

    if (turnstileSecret) {
      const token = typeof body.turnstileToken === "string" ? body.turnstileToken : ""

      if (!token) {
        return NextResponse.json(
          { error: "Please verify you are human before requesting a code." },
          { status: 400 },
        )
      }

      try {
        const clientIp =
          req.headers.get("cf-connecting-ip") ??
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          undefined

        const payload = new URLSearchParams()
        payload.append("secret", turnstileSecret)
        payload.append("response", token)
        if (clientIp) {
          payload.append("remoteip", clientIp)
        }

        const verificationResponse = await fetch(
          "https://challenges.cloudflare.com/turnstile/v0/siteverify",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: payload,
            signal: AbortSignal.timeout(10_000),
          },
        )

        if (!verificationResponse.ok) {
          console.error(
            "Turnstile verification request failed",
            verificationResponse.status,
            verificationResponse.statusText,
          )
          return NextResponse.json(
            { error: "Turnstile verification failed. Please try again." },
            { status: 502 },
          )
        }

        const verificationResult = (await verificationResponse.json()) as {
          success?: boolean
          "error-codes"?: string[]
        }

        if (!verificationResult.success) {
          return NextResponse.json(
            { error: "Please verify you are human before requesting a code." },
            { status: 400 },
          )
        }
      } catch (error) {
        console.error("Error verifying Turnstile token:", error)
        return NextResponse.json(
          { error: "Turnstile verification failed. Please try again." },
          { status: 502 },
        )
      }
    }

    const code = await issueOtp(key, requestAddress(req))
    if (!code) return NextResponse.json({ error: "Too many OTP requests. Please try again later." }, { status: 429 })

    // Send email
    const host = new URL(process.env.ORIGIN || req.url).host
    const text = `Your ${host} verification code is ${code}`
    const html = `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src='https://${host}/gustav.png' alt='GRH Logo' style='width: 64px; height: 64px; border-radius: 50%; background: #f3f3f3; margin-bottom: 8px;' />
          <h2 style="margin: 0; font-size: 1.5rem; color: #222;">GRH Booking</h2>
        </div>
        <p style="font-size: 1.1rem; color: #222; margin-bottom: 16px;">Your verification code:</p>
        <div style="font-size: 2.2rem; font-weight: bold; letter-spacing: 0.25em; color: #1a73e8; background: #f5faff; border-radius: 8px; padding: 16px 0; text-align: center; margin-bottom: 20px;">
          <b>${code}</b>
        </div>
        <p style="color: #444; font-size: 1rem; margin-bottom: 0;">Enter this code in the app to sign in.<br>For your security, this code will expire soon.</p>
        <p style="color: #888; font-size: 0.95rem; margin-top: 24px; text-align: center;">If you did not request this, you can ignore this email.</p>
      </div>
    `

    if (isDev) {
      // skip sending mail in dev
    } else {
      await transporter!.sendMail({
        to: key,
        from: CONTACT_EMAIL,
        subject: `Your ${host} verification code`,
        text,
        html,
      })
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent successfully",
    })
  } catch (error) {
    console.error("Error sending OTP")
    return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 })
  }
}
