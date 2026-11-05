import { createHash, randomBytes } from "node:crypto"
import type { Prisma, PrismaClient } from "@prisma/client"
import prisma from "@/lib/prismadb"

type Database = Prisma.TransactionClient | PrismaClient
export const digest = (value: string) => createHash("sha256").update(value).digest("hex")

/** Atomic database-time fixed-window budget. Saturated buckets stop incrementing. */
export async function consumeBudget(
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
  db: Database = prisma,
): Promise<boolean> {
  const key = `rate:${scope}:${digest(subject)}`
  const rows = await db.$queryRaw<Array<{ key: string }>>`
    INSERT INTO "AuthState" ("key", "value", "expiresAt")
    VALUES (${key}, '{"count":1}'::jsonb, clock_timestamp() + ${windowMs} * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "value" = jsonb_build_object('count', CASE WHEN "AuthState"."expiresAt" <= clock_timestamp()
        THEN 1 ELSE ("AuthState"."value"->>'count')::int + 1 END),
      "expiresAt" = CASE WHEN "AuthState"."expiresAt" <= clock_timestamp()
        THEN clock_timestamp() + ${windowMs} * interval '1 millisecond' ELSE "AuthState"."expiresAt" END
    WHERE "AuthState"."expiresAt" <= clock_timestamp() OR ("AuthState"."value"->>'count')::int < ${limit}
    RETURNING "key"`
  return rows.length === 1
}

export async function putSecretState(
  namespace: string,
  value: Prisma.InputJsonObject,
  ttlMs = 300_000,
  db: Database = prisma,
) {
  const secret = randomBytes(32).toString("base64url")
  await db.authState.create({ data: {
    key: `${namespace}:${digest(secret)}`, value, expiresAt: new Date(Date.now() + ttlMs),
  } })
  return secret
}

/** DELETE RETURNING makes consuming a secret single-use across all instances. */
export async function consumeSecretState(namespace: string, secret: string, db: Database = prisma) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return null
  const rows = await db.$queryRaw<Array<{ value: Prisma.JsonObject }>>`
    DELETE FROM "AuthState" WHERE "key" = ${`${namespace}:${digest(secret)}`}
      AND "expiresAt" > clock_timestamp() RETURNING "value"`
  return rows[0]?.value ?? null
}

/** Check browser ownership inside the same atomic delete; a foreign browser cannot burn a token. */
export async function consumeBoundSecretState(
  namespace: string, secret: string, binding: string, db: Database = prisma,
) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret) || !/^[a-f0-9]{64}$/.test(binding)) return null
  const rows = await db.$queryRaw<Array<{ value: Prisma.JsonObject }>>`
    DELETE FROM "AuthState" WHERE "key" = ${`${namespace}:${digest(secret)}`}
      AND "expiresAt" > clock_timestamp() AND "value"->>'binding' = ${binding}
    RETURNING "value"`
  return rows[0]?.value ?? null
}

export async function cleanExpiredAuthState() {
  // Bounded deletion prevents a maintenance request monopolizing the database.
  await prisma.$executeRaw`DELETE FROM "AuthState" WHERE "key" IN
    (SELECT "key" FROM "AuthState" WHERE "expiresAt" < clock_timestamp() LIMIT 1000)`
}

export async function maintainAuthState() {
  if (await consumeBudget("auth-cleanup", "all", 1, 60_000)) await cleanExpiredAuthState()
}

export function requestAddress(req?: Request) {
  // Vercel overwrites x-vercel-forwarded-for; do not trust arbitrary proxy chains.
  if (process.env.VERCEL === "1") {
    return req?.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "unknown"
  }
  return "local"
}
