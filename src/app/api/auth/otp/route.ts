import { NextResponse } from "next/server"
import { otpFailures } from "../../../../../auth"
import prisma from "../../../../lib/prismadb"
import { normalizeEmail } from "@/utils/email"

// Helper function for HMAC SHA256 using Web Crypto
async function generateHmacSha256(data: string, secret: string): Promise<string> {
  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", secretKey, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function handleSignInFailure(
  emailKey: string,
  currentFailState: { count: number; locked: number } | undefined,
  currentTimestamp: number,
) {
  const count = currentFailState ? currentFailState.count + 1 : 1
  if (count >= 5) {
    otpFailures.set(emailKey, { count: 0, locked: currentTimestamp + 15 * 60 * 1000 }) // Lock for 15 minutes
  } else {
    otpFailures.set(emailKey, { count, locked: 0 })
  }
}

export async function POST(req: Request) {
  const { token, email } = await req.json() // token here is the code part from user input
  const key = normalizeEmail(email)
  const fail = otpFailures.get(key)
  const now = Date.now()

  if (fail && fail.locked > now) {
    return NextResponse.json(
      { message: "Too many attempts. Please try again later." },
      { status: 429 },
    )
  }

  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!authSecret) {
    return NextResponse.json({ message: "Server configuration error." }, { status: 500 })
  }

  // Use Web Crypto for HMAC, consistent with auth.ts's generateVerificationToken
  const h = await generateHmacSha256(token, authSecret)
  const fullToken = `${token}.${h}`

  try {
    // Look for the verification token in the database
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        identifier: key,
        token: fullToken,
        expires: {
          gt: new Date(), // Token must not be expired
        },
      },
    })

    if (!verificationToken) {
      handleSignInFailure(key, fail, now)
      return NextResponse.json({ message: "Invalid or expired code." }, { status: 401 })
    } // Token is valid, delete it so it can't be reused
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: key,
          token: fullToken,
        },
      },
    }) // Clear any previous failures for this email
    otpFailures.delete(key)

    // Return success - the frontend will handle the actual NextAuth.js sign-in
    return NextResponse.json({
      success: true,
      email: key,
      verifiedToken: fullToken, // Send the verified token back to frontend
      message: "OTP verified successfully",
    })
  } catch (error) {
    console.error("Error verifying OTP:", error)
    handleSignInFailure(key, fail, now)
    return NextResponse.json({ message: "Error during verification process." }, { status: 500 })
  }
}
