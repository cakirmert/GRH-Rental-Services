"use client"

import { useCallback, useMemo, type ReactNode } from "react"
import { SessionProvider, signOut as providerSignOut, useSession } from "next-auth/react"
import { accountFromSession } from "./session-account"
import type { CurrentAccount, IdentitySession, IdentityStatus } from "./types"

export interface IdentityProviderProps {
  children: ReactNode
  session?: IdentitySession | null
}

/** One provider at the application boundary; the existing auth API/cookies remain intact. */
export function IdentityProvider({ children, session }: IdentityProviderProps) {
  // The existing provider's augmented User type requires a string email.
  const providerSession = useMemo(() => session ? {
    ...session,
    user: { ...session.user, email: session.user.email ?? "" },
  } : session, [session])
  return <SessionProvider session={providerSession}>{children}</SessionProvider>
}

export interface CurrentAccountState {
  user: CurrentAccount | null
  status: IdentityStatus
  refresh: () => Promise<CurrentAccount | null>
  signOut: () => Promise<void>
}

export function useCurrentAccount(): CurrentAccountState {
  const { data, status: providerStatus, update } = useSession()
  const user = providerStatus === "authenticated" ? accountFromSession(data) : null
  const status: IdentityStatus = providerStatus === "loading"
    ? "loading"
    : user ? "authenticated" : "unauthenticated"
  // Never pass caller-supplied roles/profile data to the provider's update callback.
  const refresh = useCallback(async () => accountFromSession(await update()), [update])
  const signOut = useCallback(async () => {
    await providerSignOut({ redirectTo: "/" })
  }, [])

  return { user, status, refresh, signOut }
}
