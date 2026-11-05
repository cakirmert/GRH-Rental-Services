"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { RELEASE_ID, type ReleaseMode } from "@/constants/release"

const storageKey = `grh-interface:${RELEASE_ID}`
const changeEvent = "grh-interface-change"
let volatileMode: ReleaseMode | null = null

function readMode(): ReleaseMode {
  if (volatileMode) return volatileMode
  try {
    const stored = localStorage.getItem(storageKey)
    return stored === "classic" ? "classic" : "preview"
  } catch {
    return "preview"
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) notify()
  }
  window.addEventListener("storage", onStorage)
  window.addEventListener(changeEvent, notify)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(changeEvent, notify)
  }
}

const ReleaseContext = createContext<{
  mode: ReleaseMode
  setMode: (mode: ReleaseMode) => void
} | null>(null)

export function ReleaseProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, readMode, () => "preview" as const)
  const setMode = useCallback((next: ReleaseMode) => {
    try {
      localStorage.setItem(storageKey, next)
      volatileMode = null
    } catch {
      volatileMode = next
    }
    window.dispatchEvent(new Event(changeEvent))
  }, [])
  const value = useMemo(() => ({ mode, setMode }), [mode, setMode])
  return <ReleaseContext.Provider value={value}>{children}</ReleaseContext.Provider>
}

export function useRelease() {
  const context = useContext(ReleaseContext)
  if (!context) throw new Error("useRelease requires ReleaseProvider")
  return context
}
