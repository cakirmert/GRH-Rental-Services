import { expect, test, type Page, type Response } from "@playwright/test"
import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import superjson from "superjson"
import en from "../../src/locales/en.json"
import de from "../../src/locales/de.json"
import { appFeedbackCopy } from "../../src/locales/app-feedback"
import { releaseCopy } from "../../src/locales/release"
import { localTestDatabase, withLocalAccount } from "./local-fixtures"

const gallery = path.resolve("test-results/fullpage-visual")
const variants = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 320, height: 800 },
] as const
type Locale = "en" | "de"
type Capture = {
  file: string
  capturedAt: string
  viewportWidth: number
  documentWidth: number
  clippedControls: number
  brokenImages: number
}

// Reject a screenshot if a private booking response is not from this test's
// synthetic owner/item. Do not include private response values in error output.
function protectPrivateScreens(page: Page, fixture: { userId: string; itemTitle: string }) {
  const pending = new Set<Promise<void>>()
  let safe = true
  const check = async (response: Response) => {
    if (!/\/api\/trpc\//.test(response.url())) return
    if (!/bookings\.(list|getBookings|listForRental)/.test(response.url())) return
    try {
      const body: unknown = await response.json()
      const packets = Array.isArray(body) ? body : [body]
      for (const packet of packets) {
        const raw = packet as { result?: { data?: Parameters<typeof superjson.deserialize>[0] } }
        if (!raw.result?.data) continue
        const value = superjson.deserialize<unknown>(raw.result.data)
        const rows = Array.isArray(value)
          ? value
          : value && typeof value === "object" && "bookings" in value
            ? value.bookings
            : []
        if (!Array.isArray(rows)) continue
        for (const row of rows) {
          if (!row || typeof row !== "object" || !("startDate" in row)) continue
          const booking = row as {
            userId?: string
            user?: { id?: string }
            item?: { titleEn?: string }
          }
          if (
            (booking.userId ?? booking.user?.id) !== fixture.userId ||
            booking.item?.titleEn !== fixture.itemTitle
          )
            safe = false
        }
      }
    } catch {
      safe = false
    }
  }
  const listener = (response: Response) => {
    const task = check(response)
    pending.add(task)
    void task.finally(() => pending.delete(task))
  }
  page.on("response", listener)
  return {
    async verify() {
      await Promise.all(pending)
      expect(safe, "Refusing capture: private booking data is not exclusively synthetic").toBe(true)
    },
    stop() {
      page.off("response", listener)
    },
  }
}

async function capture(page: Page, file: string, entries: Capture[], verify?: () => Promise<void>) {
  // Radix correctly removes the background header from the accessibility tree
  // while a modal is open; it remains part of the visual page being captured.
  await expect(page.locator("header").first()).toBeVisible()
  if (page.viewportSize()!.width >= 768) {
    await expect(page.locator("canvas[data-site-background]")).toBeVisible()
    await page.waitForFunction(
      () =>
        (document.querySelector("canvas[data-site-background]") as HTMLCanvasElement)?.width > 0,
    )
  }
  await page.evaluate(async () => {
    await document.fonts.ready
    // Request all real page images before a full-page capture, including those
    // normally loaded lazily as the visitor scrolls. No image content is replaced.
    document.querySelectorAll("img").forEach((image) => {
      image.loading = "eager"
    })
    window.scrollTo(0, 0)
  })
  await page.waitForFunction(() => [...document.images].every((image) => image.complete))
  await verify?.()
  const metrics = await page.evaluate(() => {
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden"
    }
    let clippedControls = 0
    for (const control of document.querySelectorAll<HTMLElement>(
      "button, input, select, textarea",
    )) {
      if (!visible(control)) continue
      const bounds = control.getBoundingClientRect()
      let ancestor = control.parentElement
      while (ancestor && ancestor !== document.body) {
        const style = getComputedStyle(ancestor)
        if (["hidden", "clip"].includes(style.overflowX)) {
          const parent = ancestor.getBoundingClientRect()
          if (bounds.left < parent.left - 1 || bounds.right > parent.right + 1) {
            clippedControls++
            break
          }
        }
        ancestor = ancestor.parentElement
      }
    }
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      clippedControls,
      brokenImages: [...document.images].filter((image) => image.naturalWidth === 0).length,
    }
  })
  expect(metrics.documentWidth, "Page overflows the viewport").toBeLessThanOrEqual(
    metrics.viewportWidth + 1,
  )
  expect(metrics.clippedControls, "A control is clipped by its container").toBe(0)
  await page.screenshot({ path: path.join(gallery, file), fullPage: true, animations: "disabled" })
  entries.push({ file, capturedAt: new Date().toISOString(), ...metrics })
}

test.beforeAll(async () => {
  await mkdir(gallery, { recursive: true })
  await writeFile(
    path.join(gallery, "README.md"),
    `# Actual V2 browser screenshots

These captures use Chrome against the running production build at http://localhost:3100.
They are actual HTTP-rendered pages, not static component fixtures or mockups.
The app's real header, content, footer, translations, fonts, and public item photos are used.

- Public catalog and item descriptions/photos come from the local clone's public item fields.
- Resident bookings and staff list/calendar use uniquely generated synthetic accounts and bookings.
- The staff account is responsible only for its synthetic item; response checks reject non-fixture booking data before capture.
- Admin screenshots show the aggregate dashboard only. No member, retention, or administrator calendar lists are captured.
- Feedback dialogs are shown with example text and unchecked public-posting consent. No report is submitted.
- Local fixture records are removed after each account's captures. Outbound email, push, and GitHub delivery remain disabled.

Open index.html for the gallery. Layout JSON files record capture times, viewport sizes, internal clipping, and broken-image counts.
Screenshots illustrate the captured pages; they do not establish complete accessibility, performance, or production acceptance.

Reproduce after starting the guarded local production server:

\`\`\`powershell
node scripts/local-site.mjs e2e
\`\`\`
`,
  )
})

test.afterAll(async () => {
  const files = (await readdir(gallery)).filter((file) => file.endsWith(".png")).sort()
  const cards = files
    .map(
      (file) =>
        `<figure data-locale="${file.endsWith("-de.png") ? "de" : "en"}"><a href="${file}"><img src="${file}" loading="lazy" alt="${file.replaceAll("-", " ").replace(".png", "")}" /></a><figcaption>${file}</figcaption></figure>`,
    )
    .join("\n")
  await writeFile(
    path.join(gallery, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GRH V2 — actual browser preview</title><style>body{margin:0;background:#f5f5f4;color:#20201e;font:16px/1.5 system-ui,sans-serif}header{max-width:1280px;margin:auto;padding:32px 24px}h1{margin-bottom:8px}p{max-width:80ch}button{padding:9px 16px;margin:0 8px 0 0;border:1px solid #aaa;border-radius:8px;background:white;font:inherit;cursor:pointer}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:24px;padding:0 24px 40px;max-width:1440px;margin:auto}figure{margin:0;background:white;border:1px solid #ddd;border-radius:12px;overflow:hidden}img{display:block;width:100%;height:600px;object-fit:contain;object-position:top;background:#e8e8e5}figcaption{padding:12px;font-size:13px;overflow-wrap:anywhere}[hidden]{display:none}</style><header><h1>GRH V2 — actual browser preview</h1><p>Chrome screenshots of the running local production build. Public catalog content is real; private accounts and bookings are synthetic. Admin views show aggregates only. Click an image for its full resolution.</p><p>Desktop: 1440px. Mobile: 320px. No feedback was submitted, and production was not changed. See <a href="README.md">capture notes</a>.</p><button data-filter="all">All</button><button data-filter="en">English</button><button data-filter="de">Deutsch</button></header><main>${cards}</main><script>document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>document.querySelectorAll('figure').forEach(card=>card.hidden=button.dataset.filter!=='all'&&card.dataset.locale!==button.dataset.filter)))</script></html>`,
  )
})

for (const locale of ["en", "de"] as const) {
  for (const viewport of variants) {
    test(`actual preview ${viewport.name} ${locale}`, async ({ page, baseURL }) => {
      test.setTimeout(180_000)
      localTestDatabase(baseURL)
      await page.setViewportSize(viewport)
      await page
        .context()
        .addCookies([{ name: "grh-locale", value: locale, url: "http://localhost:3100" }])
      await page.addInitScript((language: Locale) => {
        localStorage.setItem("grh-booking-language", language)
        localStorage.setItem("grh-booking-theme", "light")
      }, locale)
      const copy = locale === "de" ? de : en
      const feedback = appFeedbackCopy[locale]
      const entries: Capture[] = []
      const suffix = `${viewport.name}-${locale}.png`
      const errors: string[] = []
      page.on("pageerror", (error) => errors.push(error.name))
      try {
        await page.goto("/")
        await expect(page.locator("#catalog-title")).toBeVisible()
        await expect(page.locator("html")).toHaveAttribute("lang", locale)
        await capture(page, `catalog-${suffix}`, entries)
        await page
          .getByRole("banner")
          .getByRole("button", { name: feedback.report, exact: true })
          .click()
        await expect(page.getByRole("dialog")).toContainText(feedback.signedOutHelp)
        await capture(page, `guest-report-${suffix}`, entries)
        await page.keyboard.press("Escape")

        await withLocalAccount(page, baseURL, "USER", async (fixture) => {
          const privacy = protectPrivateScreens(page, fixture)
          try {
            await page
              .getByRole("button", { name: copy.itemCard.viewAndBookButton, exact: true })
              .first()
              .click()
            await expect(page).toHaveURL(/\/items\/[^/?]+$/)
            await expect(
              page.getByRole("heading", {
                name: copy.bookingForm.selectDateAndTimeTitle,
                exact: true,
              }),
            ).toBeVisible()
            await capture(page, `booking-${suffix}`, entries, privacy.verify)
            await page.goto("/bookings")
            await expect(page.getByText(fixture.itemTitle, { exact: true })).toBeVisible()
            await capture(page, `my-bookings-${suffix}`, entries, privacy.verify)
            await page
              .getByRole("banner")
              .getByRole("button", { name: feedback.report, exact: true })
              .click()
            const dialog = page.getByRole("dialog")
            await expect(dialog).toContainText(feedback.publicTitle)
            await dialog
              .getByLabel(feedback.summary, { exact: true })
              .fill(
                locale === "de" ? "Idee zur Buchungsübersicht" : "Idea for the booking overview",
              )
            await dialog
              .getByLabel(feedback.details, { exact: true })
              .fill(
                locale === "de"
                  ? "Ein Beispiel für eine Meldung: Ich möchte kommende Buchungen leichter vergleichen können."
                  : "Example feedback: I would like to compare my upcoming bookings more easily.",
              )
            await expect(dialog.getByRole("checkbox")).not.toBeChecked()
            await dialog.evaluate((element) => {
              element.scrollTop = 0
            })
            await capture(page, `report-dialog-${suffix}`, entries, privacy.verify)
            await dialog.getByRole("checkbox").scrollIntoViewIfNeeded()
            await capture(page, `report-consent-${suffix}`, entries, privacy.verify)
            await page.keyboard.press("Escape")
          } finally {
            privacy.stop()
          }
        })

        await withLocalAccount(page, baseURL, "RENTAL", async (fixture) => {
          const privacy = protectPrivateScreens(page, fixture)
          try {
            await page.goto("/staff")
            await expect(page.locator("#rental-booking-list")).toContainText(fixture.itemTitle)
            await capture(page, `rental-dashboard-${suffix}`, entries, privacy.verify)
            await page
              .getByRole("tab", { name: copy.header.rentalCalendarLink, exact: true })
              .click()
            await expect(page).toHaveURL("http://localhost:3100/staff/calendar")
            await expect(
              page.getByRole("region", { name: releaseCopy[locale].controls }),
            ).toBeVisible()
            const bookingDay = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Europe/Berlin",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(Date.now() + 2 * 86_400_000))
            await page.getByLabel(copy.calendar.jumpToDate).fill(bookingDay)
            if (viewport.name === "desktop") {
              await page
                .getByRole("group", { name: copy.calendar.viewLabel })
                .getByRole("button", { name: copy.calendar.views.month, exact: true })
                .click()
            }
            await expect(page.getByText(fixture.itemTitle, { exact: false }).first()).toBeVisible()
            await capture(page, `calendar-${suffix}`, entries, privacy.verify)
          } finally {
            privacy.stop()
          }
        })

        await withLocalAccount(page, baseURL, "ADMIN", async () => {
          await page.goto("/admin")
          await expect(
            page.getByRole("heading", { name: copy.adminDashboard.home.title, exact: true }),
          ).toBeVisible()
          await expect(page.locator("#admin-dashboard-stats .animate-pulse")).toHaveCount(0)
          await capture(page, `admin-dashboard-${suffix}`, entries)
          await page.getByRole("button", { name: copy.helpPage.quickTour, exact: true }).click()
          await page.keyboard.press("ArrowRight")
          await page.keyboard.press("ArrowRight")
          await page.keyboard.press("ArrowRight")
          await expect(page.getByText("4 of 7", { exact: true })).toBeVisible()
          await expect(
            page.getByText(copy.helpPage.adminStepInactive, { exact: true }),
          ).toBeVisible()
          await expect(page.locator("#admin-quick-inactive")).toHaveClass(/ring-blue-500/)
          await capture(page, `admin-tour-inactive-${suffix}`, entries)
          await page.keyboard.press("Escape")
        })
        expect(errors, "Unexpected application runtime error during preview").toEqual([])
      } finally {
        await writeFile(
          path.join(gallery, `layout-${viewport.name}-${locale}.json`),
          JSON.stringify(entries, null, 2),
        )
      }
    })
  }
}
