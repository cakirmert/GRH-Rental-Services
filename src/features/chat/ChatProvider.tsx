"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useCurrentAccount } from "@/features/identity/client"

const ChatContext = createContext<{ openChat: (bookingId: string) => void } | null>(null)

/** Shared navigation port used by booking features and existing notification widgets. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user } = useCurrentAccount()
  const accountId = user?.id
  const openChat = useCallback(
    (bookingId: string) => {
      if (bookingId) router.push("/messages/" + encodeURIComponent(bookingId))
    },
    [router],
  )
  useEffect(() => {
    if (!accountId) return
    const custom = (event: Event) => {
      const id = (event as CustomEvent<{ bookingId?: unknown }>).detail?.bookingId
      if (typeof id === "string") openChat(id)
    }
    const push = (event: MessageEvent) => {
      if (event.data?.type !== "NOTIFICATION_CLICK" || typeof event.data.bookingId !== "string")
        return
      if (event.data.notificationType === "chat") openChat(event.data.bookingId)
      else router.push("/bookings/" + encodeURIComponent(event.data.bookingId))
    }
    window.addEventListener("grh-open-chat", custom)
    navigator.serviceWorker?.addEventListener("message", push)
    return () => {
      window.removeEventListener("grh-open-chat", custom)
      navigator.serviceWorker?.removeEventListener("message", push)
    }
  }, [accountId, openChat, router])
  const value = useMemo(() => ({ openChat }), [openChat])
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const value = useContext(ChatContext)
  if (!value) throw new Error("Chat navigation requires ChatProvider")
  return value
}
