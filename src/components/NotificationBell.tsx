"use client"

import { Bell, X } from "lucide-react"
import { trpc } from "@/utils/trpc"
import { useNotifications } from "@/hooks/useNotifications"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useChat } from "@/features/chat/ChatProvider"
import { useRouter } from "next/navigation"
import { useI18n } from "@/locales/i18n"

export default function NotificationBell() {
  const { t } = useI18n()
  const { data: notifications = [], refetch, isLoading, isFetching } = useNotifications()
  const utils = trpc.useUtils()
  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: (_, { id }) => {
      utils.notifications.getAll.setData(
        undefined,
        (data) => data?.map((n) => (n.id === id ? { ...n, read: true } : n)) ?? [],
      )
    },
  })
  const deleteNotif = trpc.notifications.delete.useMutation({
    onSuccess: (_, { id }) => {
      utils.notifications.getAll.setData(
        undefined,
        (data) => data?.filter((n) => n.id !== id) ?? [],
      )
    },
  })
  const clearAll = trpc.notifications.clearAll.useMutation({
    onSuccess: () => {
      utils.notifications.getAll.setData(undefined, [])
    },
  })
  const unread = notifications.filter((n) => !n.read).length
  const { openChat } = useChat()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const loading = open && (isLoading || isFetching)
  const handleClick = (n: {
    id: string
    bookingId: string | null
    type: string
    message: string
    read: boolean
  }) => {
    if (!n.read) markRead.mutate({ id: n.id })
    setOpen(false)
    if (n.bookingId) {
      let isChat = false
      try {
        const parsed = JSON.parse(n.message) as { key: string; vars?: Record<string, string> }
        if (
          parsed.key === "notifications.newChat" ||
          parsed.key === "notifications.newChatMessage"
        ) {
          isChat = true
        }
      } catch {
        if (n.message.toLowerCase().includes("chat message")) {
          isChat = true
        }
      }

      if (isChat) {
        openChat(n.bookingId)
      } else {
        router.push(
          n.type === "BOOKING_REQUEST" ? "/staff" : "/bookings/" + encodeURIComponent(n.bookingId),
        )
      }
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          refetch()
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("notifications.title")}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full text-[10px] h-4 w-4 flex items-center justify-center">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-60 overflow-y-auto">
        {loading ? (
          <div className="p-2 text-sm">{t("common.loading")}</div>
        ) : notifications.length === 0 ? (
          <div className="p-2 text-sm text-muted-foreground">{t("notifications.none")}</div>
        ) : (
          <>
            {notifications.map((n) => {
              let text = n.message
              try {
                const parsed = JSON.parse(n.message) as {
                  key: string
                  vars?: Record<string, string | number>
                }
                text = t(parsed.key, parsed.vars)
              } catch {
                // ignore JSON parse errors and use raw message
              }
              return (
                <DropdownMenuItem
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={n.read ? "group" : "font-semibold group"}
                >
                  <span className="flex-1">{text}</span>
                  <button
                    aria-label={t("notifications.delete")}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      deleteNotif.mutate({ id: n.id })
                    }}
                    className="p-1 cursor-pointer"
                  >
                    <X className="h-4 w-4 opacity-70 group-hover:text-destructive" />
                  </button>
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuItem
              onClick={() => clearAll.mutate()}
              className="justify-center text-destructive"
            >
              {t("notifications.clearAll")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
