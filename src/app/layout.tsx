import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { auth } from "../../auth"
import type { Session } from "next-auth"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import type { ReactNode } from "react"
import AppLayoutClient from "./layout-client"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
})

export const metadata: Metadata = {
  title: "GRH Rental Services",
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
  const session: Session | null = await auth()
  return (
    <html lang="en" suppressHydrationWarning>
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
        <AppLayoutClient session={session}>{children}</AppLayoutClient>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
