"use client"

import dynamic from "next/dynamic"
import type { ReactNode } from "react"
import type { Session } from "next-auth"
import Providers from "./providers"
import Header from "@/components/Header"
import Footer from "@/components/Footer"

const FlickeringGrid = dynamic(
  () => import("@/components/ui/shadcn-io/flickering-grid").then((mod) => mod.FlickeringGrid),
  { ssr: false, loading: () => null },
)

const PushNotificationManager = dynamic(() => import("@/components/PushNotificationManager"), {
  ssr: false,
  loading: () => null,
})

const InstallPrompt = dynamic(() => import("@/components/InstallPrompt"), {
  ssr: false,
  loading: () => null,
})

interface AppLayoutClientProps {
  session: Session | null
  children: ReactNode
}

export default function AppLayoutClient({ session, children }: AppLayoutClientProps) {
  return (
    <Providers session={session}>
      <div className="relative flex flex-col min-h-screen tabindex--1">
        <FlickeringGrid
          className="absolute inset-0 -z-10 hidden h-full w-full pointer-events-none md:block"
          color="rgb(120, 113, 108)"
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
  )
}
