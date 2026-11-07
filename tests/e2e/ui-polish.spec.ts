import { expect, test, type Page } from "@playwright/test"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { addDays } from "date-fns"
import { formatInBerlin, toBerlinDate } from "../../src/lib/berlin-time"
import { localTestDatabase, withLocalAccount } from "./local-fixtures"
import { version } from "../../package.json"

const gallery = path.resolve("test-results/ui-polish")

async function assertNoOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    document: document.documentElement.scrollWidth,
    clippedHeader: [...document.querySelectorAll<HTMLElement>("header button, header a")].some(
      (element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > innerWidth + 1)
      },
    ),
  }))
  expect(layout.document).toBeLessThanOrEqual(layout.width + 1)
  expect(layout.clippedHeader).toBe(false)
}

async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready
    document.querySelectorAll("img").forEach((image) => {
      image.loading = "eager"
    })
  })
  await page.waitForFunction(() => [...document.images].every((image) => image.complete))
  await assertNoOverflow(page)
  await page.screenshot({ path: path.join(gallery, name), fullPage: true, animations: "disabled" })
}

test.beforeAll(async () => {
  await mkdir(gallery, { recursive: true })
})
test.afterAll(async () => {
  const files = (await readdir(gallery)).filter((file) => file.endsWith(".png")).sort()
  await writeFile(
    path.join(gallery, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GRH UI updates</title><style>body{margin:0;background:#f5f5f4;color:#292524;font:16px/1.5 system-ui}header{max-width:1400px;margin:auto;padding:32px 24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:24px;max-width:1400px;margin:auto;padding:0 24px 40px}figure{margin:0;background:white;border:1px solid #ddd;border-radius:12px;overflow:hidden}img{width:100%;height:650px;object-fit:contain;object-position:top;display:block;background:#e7e5e4}figcaption{padding:12px}a{color:inherit}</style><header><h1>GRH UI updates</h1><p>Actual local website screenshots in light and dark themes. Test accounts are synthetic; no booking was submitted.</p><p><a href="../fullpage-visual/index.html">See all main pages in English and German</a></p></header><main>${files.map((file) => `<figure><a href="${file}"><img src="${file}" alt="${file.replaceAll("-", " ")}" loading="lazy"></a><figcaption>${file}</figcaption></figure>`).join("")}</main></html>`,
  )
})

for (const view of [
  { name: "desktop-dark", width: 1440, height: 1000, theme: "dark" },
  { name: "mobile-light", width: 375, height: 900, theme: "light" },
] as const) {
  test(`contained booking availability and footer ${view.name}`, async ({ page, baseURL }) => {
    localTestDatabase(baseURL)
    await page.setViewportSize(view)
    await page.emulateMedia({ reducedMotion: "reduce" })
    await page.addInitScript((theme) => {
      localStorage.setItem("grh-booking-theme", theme)
      localStorage.setItem("grh-booking-language", "en")
    }, view.theme)
    await page.goto("/")
    await expect(page.locator("#catalog-title")).toBeVisible()
    await expect(page.locator("html")).toHaveClass(new RegExp(view.theme))
    if (view.width >= 768) await expect(page.locator("canvas[data-site-background]")).toBeVisible()
    const footer = page.locator("footer")
    const developer = footer.getByRole("link", { name: "Developer Info" })
    await developer.hover()
    expect(await developer.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      "rgba(0, 0, 0, 0)",
    )
    await expect(footer).not.toContainText("Calendar feedback")
    await expect(footer).toContainText(`v${version}`)
    await page.evaluate(() => window.scrollTo(0, 0))
    await capture(page, `home-${view.name}.png`)
    await footer.screenshot({ path: path.join(gallery, `footer-${view.name}.png`) })

    await withLocalAccount(page, baseURL, "USER", async () => {
      await page.getByRole("button", { name: "View & Book", exact: true }).first().click()
      await expect(
        page.getByRole("heading", { name: "Select Date and Time", exact: true }),
      ).toBeVisible()
      await expect(page.locator("[data-day]").first()).toBeVisible()
      const notes = page.getByRole("textbox", { name: "Notes (Required)", exact: true })
      await notes
        .locator("..")
        .screenshot({ path: path.join(gallery, `notes-empty-${view.name}.png`) })
      await notes.fill("A private residents' celebration.")
      await notes.press("Tab")
      await notes
        .locator("..")
        .screenshot({ path: path.join(gallery, `notes-filled-${view.name}.png`) })
      await notes.fill("")
      await notes.press("Tab")
      const today = toBerlinDate()
      const from = addDays(today, (5 - today.getDay() + 7) % 7 || 7)
      const to = addDays(from, 1)
      // DayPicker's data-day is a Berlin civil date; no browser timezone conversion.
      const fromSelector = `[data-day="${formatInBerlin(from, "yyyy-MM-dd")}"] button`
      if (!(await page.locator(fromSelector).count()))
        await page.getByRole("button", { name: "Next month", exact: true }).click()
      await page.locator(fromSelector).click()
      const availability = page.getByRole("region", { name: "Availability", exact: true })
      await expect(availability.getByRole("slider", { name: /^Start/ })).toBeVisible()
      await availability.screenshot({
        path: path.join(gallery, `availability-single-day-${view.name}.png`),
      })
      const toSelector = `[data-day="${formatInBerlin(to, "yyyy-MM-dd")}"] button`
      if (!(await page.locator(toSelector).count()))
        await page.getByRole("button", { name: "Next month", exact: true }).click()
      await page.locator(toSelector).click()
      await expect(availability).toBeVisible()
      await expect(availability.getByRole("slider", { name: /^End/ })).toBeVisible()
      await availability.screenshot({
        path: path.join(gallery, `availability-defaults-${view.name}.png`),
      })
      const start = availability.getByRole("slider", { name: /^Start/ })
      const end = availability.getByRole("slider", { name: /^End/ })
      await start.focus()
      await page.keyboard.press("Home")
      await expect(start).toHaveAttribute("aria-valuetext", "08:00")
      await end.focus()
      await page.keyboard.press("End")
      for (let step = 0; step < 17; step++) await page.keyboard.press("ArrowLeft")
      await expect(end).toHaveAttribute("aria-valuetext", "17:45")
      const contained = await availability.evaluate((section) => {
        const parent = section.getBoundingClientRect()
        return [...section.querySelectorAll("[role=slider], time, [role=img]")].every((element) => {
          const bounds = element.getBoundingClientRect()
          return (
            bounds.left >= parent.left &&
            bounds.right <= parent.right &&
            bounds.top >= parent.top &&
            bounds.bottom <= parent.bottom
          )
        })
      })
      expect(contained, "Availability controls must stay inside their panel").toBe(true)
      await expect(availability).toContainText("Berlin time")
      await expect(availability.getByRole("status")).toContainText(
        "This period includes fully booked time",
      )
      await expect(
        page.getByRole("button", { name: "Continue to Booking", exact: true }),
      ).toBeDisabled()
      await page.evaluate(() => window.scrollTo(0, 0))
      await capture(page, `booking-${view.name}.png`)
      await availability.screenshot({ path: path.join(gallery, `availability-${view.name}.png`) })
    })
  })
}

test("German administrator header fits at desktop breakpoints", async ({ page, baseURL }) => {
  localTestDatabase(baseURL)
  await page
    .context()
    .addCookies([{ name: "grh-locale", value: "de", url: "http://localhost:3100" }])
  await page.addInitScript(() => {
    localStorage.setItem("grh-booking-theme", "light")
    localStorage.setItem("grh-booking-language", "de")
  })
  await withLocalAccount(page, baseURL, "ADMIN", async () => {
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      await assertNoOverflow(page)
      await capture(page, `admin-header-${width}.png`)
    }
  })
})
