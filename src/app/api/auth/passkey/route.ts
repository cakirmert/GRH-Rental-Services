import { NextResponse } from "next/server"
import { signIn } from "../../../../../auth"

export async function POST(req: Request) {
  const { token } = await req.json()
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ message: "Invalid token" }, { status: 400 })
  }

  try {
    const res = await signIn("passkey", {
      token,
      redirect: false,
    })

    if (typeof res === "string") {
      return NextResponse.json({ ok: true, redirectUrl: res })
    }

    // If it's an object, check for error
    if (res && typeof res === "object" && "error" in res && res.error) {
      return NextResponse.json({ message: res.error }, { status: 401 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ message: "Authentication failed" }, { status: 401 })
  }
}
