import { createHmac, randomInt } from "node:crypto"
import { z } from "zod"
import prisma from "@/lib/prismadb"
import { consumeBudget, digest, maintainAuthState } from "./state"

export function parseMailbox(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  // Nodemailer accepts recipient lists and display names; this boundary accepts one mailbox.
  if (normalized.length > 254 || !z.email().safeParse(normalized).success) return null
  return normalized
}

function codeHash(email: string, code: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is required")
  return createHmac("sha256", secret).update(`otp:${email}:${code}`).digest("hex")
}

export async function issueOtp(email: string, address: string) {
  if (!parseMailbox(email)) throw new Error("Invalid mailbox")
  // Global cap bounds storage even when attackers vary addresses and recipient identities.
  if (!(await consumeBudget("otp-issue-global", "all", 200, 3_600_000)) ||
      !(await consumeBudget("otp-issue-address", address, 15, 3_600_000)) ||
      !(await consumeBudget("otp-issue-mailbox", email, 5, 3_600_000))) return null
  await maintainAuthState()
  const code = randomInt(100000, 1000000).toString()
  const key = `otp:${digest(email)}`
  await prisma.authState.upsert({ where: { key }, create: {
    key, value: { hash: codeHash(email, code) }, expiresAt: new Date(Date.now() + 300_000),
  }, update: { value: { hash: codeHash(email, code) }, expiresAt: new Date(Date.now() + 300_000) } })
  return code
}

export async function consumeOtp(email: string, code: string) {
  if (!parseMailbox(email) || code.length > 64) return false
  // Attempts are charged before verification and never reset by another issuance request.
  if (!(await consumeBudget("otp-verify-global", "all", 2000, 900_000)) ||
      !(await consumeBudget("otp-verify-mailbox", email, 5, 900_000))) return false
  if (!/^\d{6}$/.test(code)) return false
  const rows = await prisma.$queryRaw<Array<{ key: string }>>`
    DELETE FROM "AuthState" WHERE "key" = ${`otp:${digest(email)}`}
      AND "expiresAt" > clock_timestamp() AND "value"->>'hash' = ${codeHash(email, code)}
    RETURNING "key"`
  return rows.length === 1
}
