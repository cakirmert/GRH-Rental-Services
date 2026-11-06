"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import { useSession } from "next-auth/react"
import NamePrompt from "@/components/NamePrompt"
import type { NamePromptContextType, NamePromptSection } from "@/types/view"

const NamePromptContext = createContext<NamePromptContextType | undefined>(undefined)

/**
 * Provider for managing the name prompt dialog state
 * @param children - React children components
 * @returns NamePromptProvider component
 */
export function NamePromptProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const account = status === "authenticated" && session?.user?.id ? session.user : null
  const identity = account
    ? JSON.stringify([account.id, account.role, account.isSuperAdmin])
    : status
  return (
    <AccountNamePrompt key={identity} account={account}>
      {children}
    </AccountNamePrompt>
  )
}

function AccountNamePrompt({
  children,
  account,
}: {
  children: ReactNode
  account: NonNullable<ReturnType<typeof useSession>["data"]>["user"] | null
}) {
  const [manualPrompt, setManualPrompt] = useState<{ section?: NamePromptSection } | null>(null)
  const needsName = !!account && !account.name
  const open = !!account && (manualPrompt !== null || needsName)
  const focusSection = manualPrompt?.section ?? (needsName ? "profile" : undefined)

  /**
   * Manually open the name prompt dialog
   */
  const openPrompt = (options?: { focusSection?: NamePromptSection }) => {
    setManualPrompt({ section: options?.focusSection })
  }
  const handleOpenChange = (newOpen: boolean) => {
    setManualPrompt(newOpen ? { section: focusSection } : null)
  }

  return (
    <NamePromptContext.Provider value={{ openPrompt }}>
      {children}
      {account && (
        <NamePrompt open={open} onOpenChange={handleOpenChange} focusSection={focusSection} />
      )}
    </NamePromptContext.Provider>
  )
}

export function useNamePrompt(): NamePromptContextType {
  const ctx = useContext(NamePromptContext)
  if (!ctx) throw new Error("useNamePrompt must be used within a NamePromptProvider")
  return ctx
}
