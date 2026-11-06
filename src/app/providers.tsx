"use client"

import { useEffect, useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { trpc, trpcClient } from "@/utils/trpc"
import { IdentityProvider, useCurrentAccount } from "@/features/identity/client"
import RefreshSessionBoundary from "@/features/identity/RefreshSessionBoundary"
import type { IdentitySession } from "@/features/identity/types"
import type { Locale } from "@/types/i18n"
import { I18nProvider } from "@/locales/i18n"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthModalProvider } from "@/contexts/AuthModalContext"
import { NamePromptProvider } from "@/contexts/NamePromptContext"
import { Toaster } from "@/components/ui/toaster"

/** A new mounted scope cannot retain old query observers or component-local copies. */
function QueryScope({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      }),
  )

  useEffect(
    () => () => {
      // Clear cancels pending query retries/results as well as removing cached data.
      // The replacement scope already owns a different client before this cleanup.
      queryClient.clear()
    },
    [queryClient],
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthModalProvider>
          <NamePromptProvider>
            {children}
            <Toaster />
          </NamePromptProvider>
        </AuthModalProvider>
      </QueryClientProvider>
    </trpc.Provider>
  )
}

function IdentityQueryScope({ children }: { children: ReactNode }) {
  const { user, status } = useCurrentAccount()
  // Loading is deliberately distinct: the provider may still retain the previous
  // session while its identity is being verified. Public children still SSR.
  const scope =
    status === "authenticated" && user
      ? JSON.stringify([user.id, user.role, user.isSuperAdmin])
      : status
  return <QueryScope key={scope}>{children}</QueryScope>
}

export default function Providers({
  children,
  session,
  initialLocale,
}: {
  children: ReactNode
  session?: IdentitySession | null
  initialLocale?: Locale
}) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <IdentityProvider session={session}>
        <RefreshSessionBoundary />
        <ThemeProvider>
          <IdentityQueryScope>{children}</IdentityQueryScope>
        </ThemeProvider>
      </IdentityProvider>
    </I18nProvider>
  )
}
