import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Providers from "./providers"
import Header from "@/components/Header"
import Footer from "@/components/Footer"
import PushNotificationManager from "@/components/PushNotificationManager"
import InstallPrompt from "@/components/InstallPrompt"
import { FlickeringGrid } from "@/components/ui/shadcn-io/flickering-grid"
import { auth } from "../../auth"
import type { Session } from "next-auth"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import type { ReactNode } from "react"

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
        <Providers session={session}>
          <div className="relative flex flex-col min-h-screen tabindex--1">
            <FlickeringGrid
              className="absolute inset-0 -z-10 h-full w-full pointer-events-none"
              color="rgb(148, 163, 184)"
              squareSize={4}
              gridGap={10}
              maxOpacity={0.25}
            />
            <div className="relative z-10 flex flex-col min-h-screen">
            <Header />
            <main role="main" className="flex-grow">
              {children}
            </main>
            <Footer />
            <PushNotificationManager />
            <InstallPrompt />
            </div>
          </div>
        </Providers>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
