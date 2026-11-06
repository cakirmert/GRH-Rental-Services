"use client"

import dynamic from "next/dynamic"
import {
  createContext,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react"
import { useSession } from "next-auth/react"
import { MessageSquareWarning, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"
import { appFeedbackCopy } from "@/locales/app-feedback"
import { RELEASE_ID } from "@/constants/release"

const FeedbackDialog = dynamic(() => import("./AppFeedbackDialog"))
const SignedOutDialog = dynamic(() => import("./SignedOutFeedbackDialog"))
const noticeEvent = "grh-update-notice-dismissed"
const serverDismissed = () => true
type DialogHandle = { open: () => void }
const FeedbackContext = createContext<{
  openReport: () => void
  trigger: RefObject<HTMLButtonElement | null>
  noticeOwner: string
  loading: boolean
} | null>(null)

function useFeedback() {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error("App feedback requires AppFeedbackProvider")
  return value
}

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const authenticated = status === "authenticated" && !!session?.user?.id
  const accountKey = authenticated ? session.user.id : status === "loading" ? "loading" : "guest"
  const manager = useRef<DialogHandle>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const openReport = useCallback(() => manager.current?.open(), [])
  const restoreFocus = useCallback(() => trigger.current?.focus(), [])
  const value = useMemo(
    () => ({ openReport, trigger, noticeOwner: accountKey, loading: status === "loading" }),
    [openReport, accountKey, status],
  )
  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {/* Only this dialog host remounts on account changes; page state stays intact. */}
      <FeedbackDialogs
        key={`${accountKey}:${RELEASE_ID}`}
        ref={manager}
        authenticated={authenticated}
        restoreFocus={restoreFocus}
      />
    </FeedbackContext.Provider>
  )
}

function FeedbackDialogs({
  ref,
  authenticated,
  restoreFocus,
}: {
  ref: Ref<DialogHandle>
  authenticated: boolean
  restoreFocus: () => void
}) {
  const [hasOpened, setHasOpened] = useState(false)
  const [open, setOpen] = useState(false)
  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        setHasOpened(true)
        setOpen(true)
      },
    }),
    [],
  )
  if (!hasOpened) return null
  return authenticated ? (
    <FeedbackDialog open={open} onOpenChange={setOpen} onRestoreFocus={restoreFocus} />
  ) : (
    <SignedOutDialog open={open} onOpenChange={setOpen} onRestoreFocus={restoreFocus} />
  )
}

export function ReportProblemButton({ className }: { className?: string }) {
  const { openReport, trigger, loading } = useFeedback()
  const { locale } = useI18n()
  return (
    <Button
      ref={trigger}
      type="button"
      variant="outline"
      size="sm"
      disabled={loading}
      aria-haspopup="dialog"
      className={className ?? "min-h-10"}
      onClick={openReport}
    >
      <MessageSquareWarning aria-hidden="true" className="h-4 w-4" />
      {appFeedbackCopy[locale].report}
    </Button>
  )
}

/** The release notice is separate from the persistent header control. */
export default function AppFeedback() {
  const { noticeOwner, loading } = useFeedback()
  if (loading) return null
  return <UpdateNotice key={`${noticeOwner}:${RELEASE_ID}`} owner={noticeOwner} />
}

function UpdateNotice({ owner }: { owner: string }) {
  const { locale } = useI18n()
  const copy = appFeedbackCopy[locale]
  const { trigger } = useFeedback()
  const storageKey = `grh-update-notice:${RELEASE_ID}:${owner}`
  const [dismissedHere, setDismissedHere] = useState(false)
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
  if (dismissedHere || dismissedStored) return null
  function dismiss() {
    trigger.current?.focus()
    setDismissedHere(true)
    try {
      localStorage.setItem(storageKey, "1")
    } catch {
      /* Dismiss for this visit. */
    }
    window.dispatchEvent(new Event(noticeEvent))
  }
  return (
    <section aria-label={copy.controls} className="border-b bg-background/80">
      <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <p className="min-w-0 text-sm leading-relaxed">
          <span className="font-medium">{copy.noticeTitle}</span> {copy.noticeBody}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          aria-label={copy.dismiss}
          onClick={dismiss}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}
