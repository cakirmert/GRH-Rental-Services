"use client"

import dynamic from "next/dynamic"
import { useCallback, useRef, useState, useSyncExternalStore } from "react"
import { useSession } from "next-auth/react"
import { MessageSquareWarning, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"
import { appFeedbackCopy } from "@/locales/app-feedback"
import { RELEASE_ID } from "@/constants/release"

const FeedbackDialog = dynamic(() => import("./AppFeedbackDialog"))
const noticeEvent = "grh-update-notice-dismissed"
const serverDismissed = () => true

export default function AppFeedback() {
  const { data: session, status } = useSession()
  if (status !== "authenticated" || !session?.user?.id) return null
  // Drafts and pending responses never cross account boundaries.
  return <AccountFeedback key={`${session.user.id}:${RELEASE_ID}`} userId={session.user.id} />
}

function AccountFeedback({ userId }: { userId: string }) {
  const { locale } = useI18n()
  const copy = appFeedbackCopy[locale]
  const storageKey = `grh-update-notice:${RELEASE_ID}:${userId}`
  const [dismissedHere, setDismissedHere] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const subscribe = useCallback(
    (notify: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey || event.key === null) notify()
      }
      window.addEventListener("storage", onStorage)
      window.addEventListener(noticeEvent, notify)
      return () => {
        window.removeEventListener("storage", onStorage)
        window.removeEventListener(noticeEvent, notify)
      }
    },
    [storageKey],
  )
  const readDismissed = useCallback(() => {
    try {
      return localStorage.getItem(storageKey) === "1"
    } catch {
      return false
    }
  }, [storageKey])
  const dismissedStored = useSyncExternalStore(subscribe, readDismissed, serverDismissed)
  const showNotice = !dismissedHere && !dismissedStored

  function dismiss() {
    trigger.current?.focus()
    setDismissedHere(true)
    try {
      localStorage.setItem(storageKey, "1")
    } catch {
      /* Keep dismissal for this visit. */
    }
    window.dispatchEvent(new Event(noticeEvent))
  }

  return (
    <section aria-label={copy.controls} className="border-b bg-background/80">
      <div className="container mx-auto flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="min-w-0 text-sm">
          {showNotice ? (
            <p className="leading-relaxed">
              <span className="font-medium">{copy.noticeTitle}</span> {copy.noticeBody}
            </p>
          ) : (
            <p className="text-muted-foreground">{copy.prompt}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            ref={trigger}
            type="button"
            variant="outline"
            size="sm"
            className="min-h-10"
            onClick={() => {
              setHasOpened(true)
              setOpen(true)
            }}
          >
            <MessageSquareWarning aria-hidden="true" className="h-4 w-4" />
            {copy.report}
          </Button>
          {showNotice && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10"
              aria-label={copy.dismiss}
              onClick={dismiss}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {hasOpened && (
        <FeedbackDialog
          open={open}
          onOpenChange={setOpen}
          onRestoreFocus={() => trigger.current?.focus()}
        />
      )}
    </section>
  )
}
