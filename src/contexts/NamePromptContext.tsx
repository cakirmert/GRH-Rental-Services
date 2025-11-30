"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
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
  const [open, setOpen] = useState(false)
  const [isManuallyOpened, setIsManuallyOpened] = useState(false)
  const [focusSection, setFocusSection] = useState<NamePromptSection | undefined>(undefined)

  useEffect(() => {
    if (status !== "authenticated") {
      setOpen(false)
      setIsManuallyOpened(false)
      setFocusSection(undefined)
      return
    }

    if (isManuallyOpened) {
      return
    }

    if (!session?.user?.name) {
      setFocusSection("profile")
      setOpen(true)
    } else {
      setOpen(false)
      setFocusSection(undefined)
    }
  }, [status, session, isManuallyOpened, open])

  /**
   * Manually open the name prompt dialog
   */
  const openPrompt = (options?: { focusSection?: NamePromptSection }) => {
    setIsManuallyOpened(true)
    setFocusSection(options?.focusSection)
    setOpen(true)
  }
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setIsManuallyOpened(false)
      setFocusSection(undefined)
    }
  }

  return (
    <NamePromptContext.Provider value={{ openPrompt }}>
      {children}
      {status === "authenticated" && (
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
