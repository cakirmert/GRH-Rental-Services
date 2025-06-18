import { NextResponse } from "next/server"
import { signIn, passkeyTokens } from "../../../../../auth"

export async function POST(req: Request) {
  const { token } = await req.json()
  const entry = passkeyTokens.get(token)
  if (!entry || entry.expires < Date.now()) {
    passkeyTokens.delete(token)
    return NextResponse.json({ message: "Invalid token" }, { status: 400 })
  }
  const userId = entry.userId
  passkeyTokens.delete(token)

  try {
    const res = await signIn("passkey", {
      userId,
      verified: "true", // Required flag to indicate passkey was already verified
      redirect: false,
    })

    //console.log('🔐 NextAuth signin result:', res);
    //console.log('🔐 NextAuth signin result type:', typeof res);

    // Check if the result is a string (URL) which indicates success
    if (typeof res === "string") {
      //console.log('✅ NextAuth signin successful, redirect URL:', res);
      return NextResponse.json({ ok: true, redirectUrl: res })
    }

    // If it's an object, check for error
    if (res && typeof res === "object" && "error" in res && res.error) {
      //console.error('❌ NextAuth signin error:', res.error);
      return NextResponse.json({ message: res.error }, { status: 401 })
    }

    //console.log('✅ NextAuth signin completed successfully');
    return NextResponse.json({ ok: true })
  } catch {
    //console.error('❌ NextAuth signin threw error:', error);
    return NextResponse.json({ message: "Authentication failed" }, { status: 401 })
  }
}
