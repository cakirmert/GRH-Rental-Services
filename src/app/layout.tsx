import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import type { ReactNode } from "react"
import AppLayoutClient from "./layout-client"
import { cookies } from "next/headers"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
})

export const metadata: Metadata = {
  title: "GRH Rental Services",
  appleWebApp: { capable: true, title: "GRH Rentals", statusBarStyle: "default" },
  icons: { apple: "/icon-192x192.png" },
}

export const viewport: Viewport = {
  colorScheme: "light dark",
}

/**
 * Root layout component for the entire application
 * @param children - Child components to render in the main content area
 * @returns Root HTML structure with providers and layout components
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = (await cookies()).get("grh-locale")?.value === "de" ? "de" : "en"
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Pre-hydration fallback: ensure body background matches system theme before next-themes applies */}
        <style id="grh-prefers-fallback">{`
          html:not(.light):not(.dark),
          html:not(.light):not(.dark) body { background-color: oklch(1 0 0); }
          @media (prefers-color-scheme: dark) {
            html:not(.light):not(.dark),
            html:not(.light):not(.dark) body { background-color: oklch(0.145 0 0); color-scheme: dark; }
          }
        `}</style>
      </head>
      <body className={`${inter.className} antialiased`}>
        <AppLayoutClient initialLocale={locale}>{children}</AppLayoutClient>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
