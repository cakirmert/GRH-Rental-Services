import { expect, test } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { localTestDatabase, withLocalAccount } from "./local-fixtures"

const gallery = path.resolve("test-results/contact")

for (const view of [
  { name: "desktop", locale: "en", theme: "dark", width: 1440, height: 1100 },
  { name: "mobile", locale: "de", theme: "light", width: 320, height: 900 },
] as const) {
  test(`contact guest and account form ${view.name}`, async ({ page, baseURL }) => {
    localTestDatabase(baseURL)
    await mkdir(gallery, { recursive: true })
    await page.setViewportSize(view)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.context().addCookies([{ name: "grh-locale", value: view.locale, url: baseURL! }])
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem("grh-booking-language", locale)
      localStorage.setItem("grh-booking-theme", theme)
    }, view)
    await page.goto("/contact")
    const email = page.locator("input#email")
    await expect(email).toBeEnabled()
    await email.fill("guest@example.test")
    await expect(email).toHaveValue("guest@example.test")
    await page.evaluate(async () => {
      await document.fonts.ready
      window.scrollTo(0, 0)
    })
    await page.screenshot({ path: path.join(gallery, `guest-${view.name}.png`), fullPage: true })

    await withLocalAccount(page, baseURL, "USER", async ({ userId }) => {
      await page.goto("/contact")
      await expect(page.locator("#email")).toHaveText(`${userId}@example.test`)
      await expect(page.locator("input#email")).toHaveCount(0)
      await page.locator("#room").fill("H.1.2.A")
      await page.locator("#issue").selectOption("inquiry")
      await page
        .locator("#message")
        .fill(
          view.locale === "de"
            ? "Ich habe eine Frage zur Ausleihe. Vielen Dank für eure Hilfe!"
            : "I have a question about renting an item. Thank you for your help!",
        )
      await expect(page.locator("html")).toHaveClass(new RegExp(view.theme))
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)
      await page.evaluate(async () => {
        await document.fonts.ready
        window.scrollTo(0, 0)
      })
      await page.screenshot({
        path: path.join(gallery, `account-${view.name}.png`),
        fullPage: true,
      })

      if (view.locale === "en") {
        // Exercise the real local endpoint, including the no-Turnstile path.
        // The guarded runner has no outbound transporter or production credentials.
        const sent = page.waitForResponse((response) => response.url().endsWith("/api/contact"))
        await page.getByRole("button", { name: "Submit", exact: true }).click()
        const response = await sent
        expect(response.status()).toBe(200)
        await expect(
          page.getByRole("heading", { name: "Thank you for reaching out!" }),
        ).toBeVisible()
        await page.getByRole("button", { name: "Send another message" }).click()
        await expect(page.locator("#message")).toHaveValue("")
      }
    })
  })
}
