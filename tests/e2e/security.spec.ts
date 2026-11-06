import { test, expect, type Page } from "@playwright/test"
import { Client } from "pg"
import { randomUUID } from "node:crypto"
import { localTestDatabase, signInWithLocalOtp, withLocalAccount } from "./local-fixtures"

test.use({ viewport: { width: 1440, height: 1000 } })

async function markDocument(page: Page) {
  const marker = randomUUID()
  await page.evaluate((value) => {
    document.documentElement.dataset.navigationMarker = value
  }, marker)
  return marker
}

async function expectClientNavigation(page: Page, path: string, marker: string) {
  await expect(page).toHaveURL("http://localhost:3100" + path)
  await expect(page.locator("html")).toHaveAttribute("data-navigation-marker", marker)
}

test("OTP, real WebAuthn registration/login, revocation and public rendering", async ({
  page,
  context,
  baseURL,
}) => {
  const url = localTestDatabase(baseURL)
  const email = "browser-" + randomUUID() + "@example.test"
  const db = new Client({ connectionString: url })
  await db.connect()
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const cdp = await context.newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  const rpc = async (name: string, input: unknown) => {
    const response = await page.request.post("/api/trpc/" + name, { data: { json: input } })
    const data = await response.json()
    expect(response.ok(), JSON.stringify(data)).toBe(true)
    return data.result.data.json
  }
  try {
    await page.goto("/")
    await expect(page.locator("#catalog-title")).toBeVisible()
    await expect(
      page.getByRole("banner").getByRole("button", { name: "Report a problem", exact: true }),
    ).toBeVisible()
    const session = await signInWithLocalOtp(page, db, email)
    const options = await rpc("webauthn.registerOptions", { userId: session.user.id })
    const credential = await page.evaluate(async (opts) => {
      const decode = (v: string) =>
        Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
      const created = (await navigator.credentials.create({
        publicKey: {
          ...opts,
          challenge: decode(opts.challenge),
          user: { ...opts.user, id: decode(opts.user.id) },
          excludeCredentials: opts.excludeCredentials?.map((c: { id: string }) => ({
            ...c,
            id: decode(c.id),
          })),
        },
      })) as PublicKeyCredential
      return created.toJSON()
    }, options)
    await rpc("webauthn.register", { credential })
    const stored = await db.query('SELECT passkeys FROM "User" WHERE id=$1', [session.user.id])
    expect(stored.rows[0].passkeys.length).toBe(1)
    const signOut = async () => {
      const csrf = await (await page.request.get("/api/auth/csrf")).json()
      await page.request.post("/api/auth/signout", {
        form: { csrfToken: csrf.csrfToken, callbackUrl: "/" },
      })
    }
    await signOut()
    const login = await rpc("webauthn.loginOptions", {})
    expect(login.allowCredentials ?? []).toHaveLength(0)
    const assertion = await page.evaluate(async (opts) => {
      const decode = (v: string) =>
        Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
      const result = (await navigator.credentials.get({
        publicKey: { ...opts, challenge: decode(opts.challenge) },
      })) as PublicKeyCredential
      return result.toJSON()
    }, login)
    const verified = await rpc("webauthn.login", { userId: "auto-detect", credential: assertion })
    const exchange = await page.request.post("/api/auth/passkey", {
      headers: { Origin: "http://localhost:3100" },
      data: { token: verified.token },
    })
    expect(exchange.status()).toBe(200)
    expect((await (await page.request.get("/api/auth/session")).json()).user.id).toBe(
      session.user.id,
    )
    const replay = await page.request.post("/api/auth/passkey", {
      headers: { Origin: "http://localhost:3100" },
      data: { token: verified.token },
    })
    expect(replay.status()).toBe(401)
    await rpc("user.deletePasskey", { credentialId: credential.id })
    const revoked = await db.query(
      'SELECT "revokedAt" FROM "PasskeyCredential" WHERE "userId"=$1',
      [session.user.id],
    )
    expect(revoked.rows[0].revokedAt).not.toBeNull()
    await signOut()
    const next = await rpc("webauthn.loginOptions", {})
    const deniedAssertion = await page.evaluate(async (opts) => {
      const challenge = Uint8Array.from(
        atob(opts.challenge.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      )
      return (
        (await navigator.credentials.get({
          publicKey: { ...opts, challenge },
        })) as PublicKeyCredential
      ).toJSON()
    }, next)
    const denied = await page.request.post("/api/trpc/webauthn.login", {
      data: { json: { userId: "auto-detect", credential: deniedAssertion } },
    })
    expect(denied.status()).toBe(400)
    expect(errors).toEqual([])
  } finally {
    await db.query('DELETE FROM "User" WHERE email=$1', [email])
    await db.end()
  }
})

test("resident navigates native booking routes without staff access or a document reload", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await withLocalAccount(page, baseURL, "USER", async ({ itemTitle }) => {
    const header = page.getByRole("banner")
    await expect(header.getByRole("link", { name: "My Bookings", exact: true })).toBeVisible()
    await expect(header.getByRole("link", { name: "Rental Dashboard", exact: true })).toHaveCount(0)
    await expect(header.getByRole("link", { name: "Admin Dashboard", exact: true })).toHaveCount(0)
    const marker = await markDocument(page)
    await header.getByRole("link", { name: "My Bookings", exact: true }).click()
    await expectClientNavigation(page, "/bookings", marker)
    await expect(page.getByRole("heading", { name: "My Bookings", exact: true })).toBeVisible()
    await expect(page.getByText(itemTitle, { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "View Details", exact: true }).click()
    await expect(page.getByRole("dialog")).toContainText(itemTitle)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.getByRole("button", { name: "Browse Items to Book", exact: true }).click()
    await expectClientNavigation(page, "/", marker)
    await expect(page.locator("#catalog-title")).toBeVisible()
    await page.goBack()
    await expectClientNavigation(page, "/bookings", marker)
    await expect(page.getByText(itemTitle, { exact: true })).toBeVisible()

    // Hiding a link is insufficient: the server must reject a direct privileged route.
    await page.goto("/admin")
    await expect(
      page.getByRole("heading", { name: "Access unavailable", exact: true }),
    ).toBeVisible()
    await expect(page.locator("#admin-dashboard-stats")).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

test("rental staff can move between bookings and calendar with calendar controls scoped to that page", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await withLocalAccount(page, baseURL, "RENTAL", async ({ itemTitle }) => {
    const header = page.getByRole("banner")
    await expect(header.getByRole("link", { name: "Rental Dashboard", exact: true })).toBeVisible()
    await expect(header.getByRole("link", { name: "Admin Dashboard", exact: true })).toHaveCount(0)
    const marker = await markDocument(page)
    await header.getByRole("link", { name: "Rental Dashboard", exact: true }).click()
    await expectClientNavigation(page, "/staff", marker)
    await expect(page.getByRole("heading", { name: "Rental Dashboard", exact: true })).toBeVisible()
    await page.getByPlaceholder("Item, user name/email...").fill(itemTitle)
    await expect(page.locator("#rental-booking-list")).toContainText(itemTitle)
    const calendarControls = page.getByRole("region", { name: "Calendar feedback and settings" })
    await expect(calendarControls).toHaveCount(0)
    await page.getByRole("tab", { name: "Calendar", exact: true }).click()
    await expectClientNavigation(page, "/staff/calendar", marker)
    await expect(calendarControls).toBeVisible()
    await expect(
      page
        .getByRole("contentinfo")
        .getByRole("button", { name: "Use classic calendar", exact: true }),
    ).toHaveCount(0)
    await page.getByRole("tab", { name: "List", exact: true }).click()
    await expectClientNavigation(page, "/staff", marker)
    await expect(calendarControls).toHaveCount(0)
    await page.goBack()
    await expectClientNavigation(page, "/staff/calendar", marker)
    await expect(calendarControls).toBeVisible()
    expect(errors).toEqual([])
  })
})

test("administrator opens native retention and calendar sections and can reload a deep link", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await withLocalAccount(page, baseURL, "ADMIN", async () => {
    const link = page
      .getByRole("banner")
      .getByRole("link", { name: "Admin Dashboard", exact: true })
    await expect(link).toBeVisible()
    const marker = await markDocument(page)
    await link.click()
    await expectClientNavigation(page, "/admin", marker)
    await expect(page.getByRole("heading", { name: "Admin Dashboard", exact: true })).toBeVisible()
    await page.locator("#admin-quick-inactive").click()
    await expectClientNavigation(page, "/admin/inactive", marker)
    await expect(page.getByRole("heading", { name: "Inactive staff", exact: true })).toBeVisible()
    await page.getByRole("tab", { name: "Rental Calendar", exact: true }).click()
    await expectClientNavigation(page, "/admin/calendar", marker)
    await expect(page.getByRole("region", { name: "Calendar feedback and settings" })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL("http://localhost:3100/admin/calendar")
    await expect(page.getByRole("tab", { name: "Rental Calendar", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    await expect(page.getByRole("region", { name: "Calendar feedback and settings" })).toBeVisible()
    expect(errors).toEqual([])
  })
})

test("resident mobile menu supports keyboard navigation and closes on route change", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await withLocalAccount(page, baseURL, "USER", async ({ itemTitle }) => {
    const header = page.getByRole("banner")
    await expect(
      header.getByRole("button", { name: "Report a problem", exact: true }),
    ).toBeVisible()
    const menu = header.getByRole("button", { name: "Toggle menu", exact: true })
    await menu.focus()
    await page.keyboard.press("Enter")
    await expect(menu).toHaveAttribute("aria-expanded", "true")
    const navigation = page.locator("#mobile-header-navigation")
    await expect(
      navigation.getByRole("link", { name: "Rental Dashboard", exact: true }),
    ).toHaveCount(0)
    const bookings = navigation.getByRole("link", { name: "My Bookings", exact: true })
    await bookings.focus()
    const marker = await markDocument(page)
    await page.keyboard.press("Enter")
    await expectClientNavigation(page, "/bookings", marker)
    await expect(menu).toHaveAttribute("aria-expanded", "false")
    await expect(navigation).toHaveCount(0)
    await expect(page.getByText(itemTitle, { exact: true })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
})
