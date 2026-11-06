import { expect, type Page } from "@playwright/test"
import { Client } from "pg"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { localDatabaseUrl } from "../../scripts/local-database.mjs"

export function localTestDatabase(baseURL: string | undefined) {
  if (
    process.env.GRH_LOCAL_TEST !== "true" ||
    process.env.DISABLE_OUTBOUND !== "true" ||
    baseURL !== "http://localhost:3100"
  ) {
    throw new Error("Browser tests require the guarded local runner and http://localhost:3100")
  }
  return localDatabaseUrl(process.env.GRH_TEST_DATABASE_URL)
}

export async function signInWithLocalOtp(page: Page, db: Client, email: string) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("Explicit local AUTH_SECRET required")
  const code = "123456"
  await db.query(
    'INSERT INTO "AuthState" ("key","value","expiresAt") VALUES ($1,$2,now()+interval \'5 minutes\')',
    [
      "otp:" + createHash("sha256").update(email).digest("hex"),
      {
        hash: createHmac("sha256", secret)
          .update("otp:" + email + ":" + code)
          .digest("hex"),
      },
    ],
  )
  const csrf = await (await page.request.get("/api/auth/csrf")).json()
  const signed = await page.request.post("/api/auth/callback/otp", {
    headers: { "X-Auth-Return-Redirect": "1" },
    form: { csrfToken: csrf.csrfToken, email, token: code, callbackUrl: "http://localhost:3100/" },
  })
  expect(signed.ok()).toBe(true)
  const session = await (await page.request.get("/api/auth/session")).json()
  expect(session.user.email).toBe(email)
  return session
}

// These fixtures create and remove only uniquely named synthetic records in a
// named loopback database. Importing this module performs no I/O.
export async function withLocalAccount(
  page: Page,
  baseURL: string | undefined,
  role: "USER" | "RENTAL" | "ADMIN",
  run: (fixture: { userId: string; itemTitle: string }) => Promise<void>,
) {
  const db = new Client({ connectionString: localTestDatabase(baseURL) })
  const userId = "browser-" + randomUUID()
  const email = userId + "@example.test"
  const itemId = "browser-item-" + randomUUID()
  const bookingId = "browser-booking-" + randomUUID()
  const itemTitle = "Browser fixture room " + itemId.slice(-8)
  await db.connect()
  try {
    await db.query(
      'INSERT INTO "User" (id,email,name,role,"emailBookingNotifications","updatedAt") VALUES ($1,$2,$3,$4,false,now())',
      [userId, email, "Browser Test " + role, role],
    )
    await db.query(
      'INSERT INTO "Item" (id,type,"titleEn","titleDe",active,"updatedAt") VALUES ($1,\'ROOM\',$2,$2,false,now())',
      [itemId, itemTitle],
    )
    if (role === "RENTAL") {
      await db.query('INSERT INTO "_ResponsibleMembers" ("A","B") VALUES ($1,$2)', [itemId, userId])
    }
    await db.query(
      'INSERT INTO "Booking" (id,"userId","itemId","assignedToId","startDate","endDate","updatedAt") VALUES ($1,$2,$3,$4,now()+interval \'2 days\',now()+interval \'2 days 2 hours\',now())',
      [bookingId, userId, itemId, role === "USER" ? null : userId],
    )
    await signInWithLocalOtp(page, db, email)
    await page.goto("/")
    await run({ userId, itemTitle })
  } finally {
    try {
      await db.query('DELETE FROM "Booking" WHERE id=$1 AND "userId"=$2', [bookingId, userId])
      await db.query('DELETE FROM "Item" WHERE id=$1', [itemId])
      await db.query('DELETE FROM "User" WHERE id=$1 AND email=$2', [userId, email])
      await db.query('DELETE FROM "AuthState" WHERE key=$1', [
        "otp:" + createHash("sha256").update(email).digest("hex"),
      ])
    } finally {
      await db.end()
    }
  }
}
