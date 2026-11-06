"use client"

import dynamic from "next/dynamic"
import type { ReactNode } from "react"
import type { IdentitySession } from "@/features/identity/types"
import type { Locale } from "@/types/i18n"
import Providers from "./providers"
import Header from "@/components/Header"
import Footer from "@/components/Footer"
import { ReleaseProvider } from "@/contexts/ReleaseContext"
import AppFeedback, { AppFeedbackProvider } from "@/components/feedback/AppFeedback"
import { ChatProvider } from "@/features/chat/ChatProvider"

const PushNotificationManager = dynamic(() => import("@/components/PushNotificationManager"), {
  ssr: false,
})
const InstallPrompt = dynamic(() => import("@/components/InstallPrompt"), { ssr: false })

export default function AppLayoutClient({
  session,
  initialLocale,
  children,
}: {
  session?: IdentitySession | null
  initialLocale?: Locale
  children: ReactNode
}) {
  return (
    <Providers session={session} initialLocale={initialLocale}>
      <ReleaseProvider>
        <AppFeedbackProvider>
          <ChatProvider>
            <div className="flex min-h-screen flex-col">
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-background focus:p-3"
              >
                Skip to content
              </a>
              <Header />
              <AppFeedback />
              <main
                id="main-content"
                tabIndex={-1}
                className="container mx-auto w-full flex-grow px-4 py-8 outline-none sm:px-6 lg:px-8 lg:py-12"
              >
                {children}
              </main>
              <Footer />
              <PushNotificationManager />
              <InstallPrompt />
            </div>
          </ChatProvider>
        </AppFeedbackProvider>
      </ReleaseProvider>
    </Providers>
  )
}
