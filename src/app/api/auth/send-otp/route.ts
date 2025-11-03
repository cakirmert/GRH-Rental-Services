import { NextResponse } from "next/server"
import { otpRequests, generateHmacSha256 } from "../../../../../auth"
import { transporter, isDev, CONTACT_EMAIL } from "../../../../lib/mail"
import prisma from "../../../../lib/prismadb"
import { normalizeEmail } from "@/utils/email"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: unknown
      turnstileToken?: unknown
    }

    const email = typeof body.email === "string" ? body.email : ""

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const key = normalizeEmail(email)

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
          console.warn("Turnstile verification unsuccessful", {
            email: key,
            errors: verificationResult["error-codes"],
          })
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

    const now = Date.now()

    // Check rate limiting
    const entry = otpRequests.get(key)
    if (entry && now - entry.ts < 60 * 60 * 1000) {
      if (entry.count >= 5) {
        return NextResponse.json(
          { error: "Too many OTP requests. Please try again later." },
          { status: 429 },
        )
      }
      entry.count += 1
    } else {
      otpRequests.set(key, { count: 1, ts: now })
    }

    // Generate OTP code and token
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    if (!process.env.AUTH_SECRET) {
      console.error("AUTH_SECRET environment variable is not set")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const h = await generateHmacSha256(code, process.env.AUTH_SECRET)
    const token = `${code}.${h}`

    // Store the verification token in database
    const expires = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    await prisma.verificationToken.create({
      data: {
        identifier: key,
        token: token,
        expires: expires,
      },
    })

    // Send email
    const host = new URL(req.url).host
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
      console.log(`\nDEV OTP for ${key}: ${code}\n`)
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
    console.error("Error sending OTP:", error)
    return NextResponse.json({ error: "Failed to send verification code" }, { status: 500 })
  }
}
