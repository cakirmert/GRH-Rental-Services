import { NextResponse } from "next/server"
import { signIn } from "../../../../../auth"

export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    return NextResponse.json({ message: "Invalid origin" }, { status: 403 })
  }
  const body = await req.text()
  if (body.length > 1024) return NextResponse.json({ message: "Request too large" }, { status: 413 })
  let token: unknown
  try { token = JSON.parse(body).token } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 })
  }
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
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
