import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import prisma from "@/lib/prismadb"
import { digest } from "./state"

const cookieName = process.env.NODE_ENV === "production" ? "__Host-grh-ceremony" : "grh-ceremony"

export async function browserBinding(create = false): Promise<string | null> {
  const jar = await cookies()
  let token = jar.get(cookieName)?.value
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    if (!create) return null
    token = randomBytes(32).toString("base64url")
    jar.set(cookieName, token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict",
      path: "/", maxAge: 3600,
    })
  }
  return digest(token)
}

export async function saveCeremony(challenge: string, flow: "registration" | "authentication", userId?: string) {
  const binding = await browserBinding(true)
  await prisma.authState.create({ data: {
    key: `ceremony:${digest(challenge)}`,
    value: { flow, binding, userId: userId ?? null },
    expiresAt: new Date(Date.now() + 300_000),
  } })
}

export function clientChallenge(credential: { response: { clientDataJSON: string } }) {
  const encoded = credential.response.clientDataJSON
  if (encoded.length > 8192 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("Invalid client data")
  const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  if (typeof data.challenge !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(data.challenge)) {
    throw new Error("Invalid challenge")
  }
  return data.challenge as string
}

export async function consumeCeremony(challenge: string, flow: "registration" | "authentication", userId?: string) {
  const binding = await browserBinding()
  if (!binding) return false
  const rows = await prisma.$queryRaw<Array<{ key: string }>>`
    DELETE FROM "AuthState" WHERE "key" = ${`ceremony:${digest(challenge)}`}
      AND "expiresAt" > clock_timestamp()
      AND "value"->>'binding' = ${binding}
      AND "value"->>'flow' = ${flow}
      AND ("value"->>'userId') IS NOT DISTINCT FROM ${userId ?? null}::text
    RETURNING "key"`
  return rows.length === 1
}
