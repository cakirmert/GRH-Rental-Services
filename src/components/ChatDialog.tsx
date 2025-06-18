"use client"

import * as Dialog from "@radix-ui/react-dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Send, Check, Loader2 } from "lucide-react"
import clsx from "clsx"
import { useSession } from "next-auth/react"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { toast } from "@/components/ui/use-toast"
import { useRef, useEffect, useMemo, useState } from "react"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string | null
  itemTitle?: string | null
}

export default function ChatDialog({ open, onOpenChange, bookingId, itemTitle }: Props) {
  // ─────── Hooks run unconditionally ───────
  const { data: session } = useSession()
  const meId = session?.user.id

  const { t } = useI18n()

  const [body, setBody] = useState("")

  const utils = trpc.useUtils()
  const msgsQry = trpc.chat.list.useInfiniteQuery(
    { bookingId: bookingId!, limit: 30 },
    {
      enabled: !!bookingId,
      getNextPageParam: (d) => d.nextCursor,
      refetchInterval: 3000,
    },
  )

  const sendMut = trpc.chat.send.useMutation({
    onSuccess: () => {
      setBody("")
      utils.chat.list.invalidate({ bookingId: bookingId! })
    },
    onError: (err) =>
      toast({
        title: t("common.error"),
        description: err.message,
        variant: "destructive",
      }),
  })

  const markMut = trpc.chat.markRead.useMutation()

  const messagesRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const marked = useRef<Set<string>>(new Set())

  // flatten pages
  const messages = useMemo(
    () => msgsQry.data?.pages.flatMap((p) => p.messages) ?? [],
    [msgsQry.data],
  )

  // unread → mark read
  const unreadIds = useMemo(() => {
    if (!meId) return []
    return messages
      .filter((m) => m.sender.id !== meId && m.reads.length === 0)
      .map((m) => m.id)
      .filter((id) => !marked.current.has(id))
  }, [messages, meId])

  useEffect(() => {
    if (unreadIds.length) {
      unreadIds.forEach((id) => marked.current.add(id))
      markMut.mutate({ messageIds: unreadIds })
    }
  }, [unreadIds, markMut])

  // auto-scroll
  useEffect(() => {
    if (stickRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const onListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    stickRef.current = dist < 96
  }

  // infinite-scroll older
  useEffect(() => {
    const pane = messagesRef.current
    const sentinel = topSentinelRef.current
    if (!pane || !sentinel) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && msgsQry.hasNextPage) {
          msgsQry.fetchNextPage().catch(() => {})
        }
      },
      { root: pane },
    )

    io.observe(sentinel)
    return () => io.disconnect()
  }, [msgsQry])

  // ─────── Guard UI after hooks ───────
  if (!bookingId) return null

  const handleSend = () => body.trim() && sendMut.mutate({ bookingId, body })
  // back closes dialog
  const handleBack = () => onOpenChange(false)

  // ─────── Render ───────
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Overlay scrolls and centers */}
        <Dialog.Overlay
          className="fixed inset-0 bg-black/50 backdrop-blur-sm
                     grid place-items-center overflow-auto p-4"
        >
          <Dialog.Content
            className="w-full max-w-2xl max-h-[90vh] bg-background
                       rounded-xl shadow-lg flex flex-col overflow-hidden"
          >
            {/* Hidden title for a11y */}
            <Dialog.Title asChild>
              <VisuallyHidden>
                {t("Chat.title")} – {itemTitle ?? "booking"}
              </VisuallyHidden>
            </Dialog.Title>

            {/* Header */}
            <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-background">
              <Button variant="ghost" size="sm" onClick={handleBack} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold">{t("Chat.title")}</h2>
              {itemTitle && (
                <span className="ml-auto text-sm text-muted-foreground">{itemTitle}</span>
              )}
            </header>

            {/* Messages */}
            <div
              ref={messagesRef}
              onScroll={onListScroll}
              className="flex-1 min-h-0 overflow-y-auto space-y-4 px-4 py-4"
            >
              {msgsQry.isInitialLoading && (
                <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin" />
              )}

              <div ref={topSentinelRef} />

              {messages.map((m) => {
                const isMe = m.sender.id === meId
                return (
                  <div
                    key={m.id}
                    className={clsx(
                      "max-w-[85%] px-4 py-3 text-sm rounded-2xl shadow-sm break-words",
                      isMe
                        ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md border bg-card text-card-foreground",
                    )}
                  >
                    {!isMe && (
                      <div className="mb-2 text-xs font-semibold text-primary">
                        {m.sender.name || "User"}
                      </div>
                    )}

                    <div className="max-h-60 overflow-y-auto pr-1 whitespace-pre-wrap leading-relaxed">
                      {m.body}
                    </div>

                    <div className="mt-2 flex justify-between text-[10px] opacity-70">
                      <span>
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {isMe &&
                        (m.reads.length ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                        ))}
                    </div>
                  </div>
                )
              })}

              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <footer className="flex-shrink-0 border-t bg-background px-4 py-4">
              <div className="flex items-end gap-3">
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t("Chat.inputPlaceholder")}
                  className="flex-9 resize-none rounded-xl"
                  rows={Math.min(Math.max(1, body.split("\n").length), 4)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                />
                <Button
                  onClick={handleSend}
                  disabled={sendMut.isPending || !body.trim()}
                  size="lg"
                  className="flex-1 min-h-[80px] rounded-xl px-4 py-2"
                >
                  {sendMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("Chat.sendInstructions")}</p>
            </footer>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
