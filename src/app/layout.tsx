import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import Providers from "./providers"
import Header from "@/components/Header"
import Footer from "@/components/Footer"
import PushNotificationManager from "@/components/PushNotificationManager"
import InstallPrompt from "@/components/InstallPrompt"
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session: Session | null = await auth()
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <Providers session={session}>
          <div className="flex flex-col min-h-screen tabindex--1">
            <Header />
            <main role="main" className="flex-grow">
              {children}
            </main>
            <Footer />
            <PushNotificationManager />
            <InstallPrompt />
          </div>
        </Providers>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  )
}
