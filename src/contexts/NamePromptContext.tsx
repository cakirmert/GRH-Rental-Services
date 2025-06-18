"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useSession } from "next-auth/react"
import NamePrompt from "@/components/NamePrompt"

interface NamePromptContextType {
  openPrompt: () => void
}

const NamePromptContext = createContext<NamePromptContextType | undefined>(undefined)

export function NamePromptProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [open, setOpen] = useState(false)
  const [isManuallyOpened, setIsManuallyOpened] = useState(false)
  useEffect(() => {
    // Only auto-close if not manually opened
    if (status !== "authenticated") {
      setOpen(false)
      setIsManuallyOpened(false)
      return
    }

    // Don't auto-manage if manually opened
    if (isManuallyOpened) {
      return
    }

    if (!session?.user?.name) {
      setOpen(true)
    } else {
      setOpen(false)
    }
  }, [status, session, isManuallyOpened, open])

  const openPrompt = () => {
    setIsManuallyOpened(true)
    setOpen(true)
  }
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setIsManuallyOpened(false)
    }
  }

  return (
    <NamePromptContext.Provider value={{ openPrompt }}>
      {children}
      {status === "authenticated" && <NamePrompt open={open} onOpenChange={handleOpenChange} />}
    </NamePromptContext.Provider>
  )
}

export function useNamePrompt(): NamePromptContextType {
  const ctx = useContext(NamePromptContext)
  if (!ctx) throw new Error("useNamePrompt must be used within a NamePromptProvider")
  return ctx
}
