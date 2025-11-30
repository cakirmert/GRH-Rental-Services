"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useSession } from "next-auth/react"
import NamePrompt from "@/components/NamePrompt"
import type { NamePromptContextType, NamePromptTarget } from "@/types/view"

const NamePromptContext = createContext<NamePromptContextType | undefined>(undefined)

/**
 * Provider for managing the name prompt dialog state
 * @param children - React children components
 * @returns NamePromptProvider component
 */
export function NamePromptProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)
  const [isManuallyOpened, setIsManuallyOpened] = useState(false)
  const [initialSection, setInitialSection] = useState<NamePromptTarget | undefined>()

  useEffect(() => {
    if (status !== "authenticated") {
      setOpen(false)
      setIsManuallyOpened(false)
      return
    }

    if (isManuallyOpened) {
      return
    }

    if (!session?.user?.name) {
      setOpen(true)
    } else {
      setOpen(false)
    }
  }, [status, session, isManuallyOpened, open])

  /**
   * Manually open the name prompt dialog
   */
  const openPrompt = (targetSection?: NamePromptTarget) => {
    setIsManuallyOpened(true)
    setInitialSection(targetSection)
    setOpen(true)
  }
  const openPasskeyPrompt = () => openPrompt("passkeys")
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setIsManuallyOpened(false)
      setInitialSection(undefined)
    }
  }

  return (
    <NamePromptContext.Provider value={{ openPrompt, openPasskeyPrompt }}>
      {children}
      {status === "authenticated" && (
        <NamePrompt open={open} onOpenChange={handleOpenChange} initialSection={initialSection} />
      )}
    </NamePromptContext.Provider>
  )
}

export function useNamePrompt(): NamePromptContextType {
  const ctx = useContext(NamePromptContext)
  if (!ctx) throw new Error("useNamePrompt must be used within a NamePromptProvider")
  return ctx
}
