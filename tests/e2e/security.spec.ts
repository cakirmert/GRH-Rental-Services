import { test, expect } from "@playwright/test"
import { Client } from "pg"
import { createHash, createHmac, randomUUID } from "node:crypto"
import { localDatabaseUrl } from "../../scripts/local-database.mjs"

test("OTP, real WebAuthn registration/login, revocation and public rendering", async ({ page, context }) => {
  if (process.env.GRH_LOCAL_TEST !== "true" || process.env.DISABLE_OUTBOUND !== "true") {
    throw new Error("Run browser tests through scripts/local-site.mjs e2e in explicit local test mode")
  }
  const url = localDatabaseUrl(process.env.GRH_TEST_DATABASE_URL)
  const email = "browser-" + randomUUID() + "@example.test"
  const code = "123456"
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("Explicit local AUTH_SECRET required")
  const db = new Client({ connectionString: url })
  await db.connect()
  const errors: string[] = []
  page.on("pageerror", error => errors.push(error.message))
  const cdp = await context.newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } })
  const rpc = async (name: string, input: unknown) => {
    const response = await page.request.post("/api/trpc/" + name, { data: { json: input } })
    const data = await response.json()
    expect(response.ok(), JSON.stringify(data)).toBe(true)
    return data.result.data.json
  }
  try {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "GRH Rental Services", exact: true })).toBeVisible()
    await db.query('INSERT INTO "AuthState" ("key","value","expiresAt") VALUES ($1,$2,now()+interval \'5 minutes\')', [
      "otp:" + createHash("sha256").update(email).digest("hex"),
      { hash: createHmac("sha256", secret).update("otp:" + email + ":" + code).digest("hex") },
    ])
    const csrf = await (await page.request.get("/api/auth/csrf")).json()
    const signed = await page.request.post("/api/auth/callback/otp", {
      headers: { "X-Auth-Return-Redirect": "1" },
      form: { csrfToken: csrf.csrfToken, email, token: code, callbackUrl: "http://localhost:3100/" },
    })
    expect(signed.ok()).toBe(true)
    const session = await (await page.request.get("/api/auth/session")).json()
    expect(session.user.email).toBe(email)
    const options = await rpc("webauthn.registerOptions", { userId: session.user.id })
    const credential = await page.evaluate(async (opts) => {
      const decode = (v: string) => Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))
      const created = await navigator.credentials.create({ publicKey: {
        ...opts, challenge: decode(opts.challenge), user: { ...opts.user, id: decode(opts.user.id) },
        excludeCredentials: opts.excludeCredentials?.map((c: { id: string }) => ({ ...c, id: decode(c.id) })),
      } }) as PublicKeyCredential
      return created.toJSON()
    }, options)
    await rpc("webauthn.register", { credential })
    const stored = await db.query('SELECT passkeys FROM "User" WHERE id=$1', [session.user.id])
    expect(stored.rows[0].passkeys.length).toBe(1)
    const signOut = async () => {
      const csrf = await (await page.request.get("/api/auth/csrf")).json()
      await page.request.post("/api/auth/signout", { form: { csrfToken: csrf.csrfToken, callbackUrl: "/" } })
    }
    await signOut()
    const login = await rpc("webauthn.loginOptions", {})
    expect(login.allowCredentials ?? []).toHaveLength(0)
    const assertion = await page.evaluate(async (opts) => {
      const decode = (v: string) => Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))
      const result = await navigator.credentials.get({ publicKey: { ...opts, challenge: decode(opts.challenge) } }) as PublicKeyCredential
      return result.toJSON()
    }, login)
    const verified = await rpc("webauthn.login", { userId: "auto-detect", credential: assertion })
    const exchange = await page.request.post("/api/auth/passkey", { headers: { Origin: "http://localhost:3100" }, data: { token: verified.token } })
    expect(exchange.status()).toBe(200)
    expect((await (await page.request.get("/api/auth/session")).json()).user.id).toBe(session.user.id)
    const replay = await page.request.post("/api/auth/passkey", { headers: { Origin: "http://localhost:3100" }, data: { token: verified.token } })
    expect(replay.status()).toBe(401)
    await rpc("user.deletePasskey", { credentialId: credential.id })
    const revoked = await db.query('SELECT "revokedAt" FROM "PasskeyCredential" WHERE "userId"=$1', [session.user.id])
    expect(revoked.rows[0].revokedAt).not.toBeNull()
    await signOut()
    const next = await rpc("webauthn.loginOptions", {})
    const deniedAssertion = await page.evaluate(async opts => {
      const challenge = Uint8Array.from(atob(opts.challenge.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0))
      return (await navigator.credentials.get({ publicKey: { ...opts, challenge } }) as PublicKeyCredential).toJSON()
    }, next)
    const denied = await page.request.post("/api/trpc/webauthn.login", { data: { json: { userId: "auto-detect", credential: deniedAssertion } } })
    expect(denied.status()).toBe(400)
    expect(errors).toEqual([])
  } finally {
    await db.query('DELETE FROM "User" WHERE email=$1', [email])
    await db.end()
  }
})
