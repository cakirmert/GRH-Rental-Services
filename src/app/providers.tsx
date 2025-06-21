// src/app/providers.tsx
"use client"

import React, { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { trpc, trpcClient } from "@/utils/trpc"
import { SessionProvider } from "next-auth/react"
import { I18nProvider } from "@/locales/i18n"
import { ThemeProvider } from "@/components/theme-provider"
import { ViewProvider } from "@/contexts/ViewContext"
import { AuthModalProvider } from "@/contexts/AuthModalContext"
import { Toaster } from "@/components/ui/toaster"
import { NamePromptProvider } from "@/contexts/NamePromptContext"

import type { Session } from "next-auth"

/**
 * Root providers component that wraps the entire application with necessary context providers
 * @param children - Child components to wrap with providers
 * @param session - NextAuth session data
 * @returns Provider wrapper component
 */
export default function Providers({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <I18nProvider>
      <SessionProvider session={session}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <AuthModalProvider>
                <NamePromptProvider>
                  <ViewProvider>{children}</ViewProvider>
                </NamePromptProvider>
                <Toaster />
              </AuthModalProvider>
            </ThemeProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </SessionProvider>
    </I18nProvider>
  )
}
