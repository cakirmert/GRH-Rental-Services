"use client"

import { useState, type FormEvent } from "react"
import { useSession } from "next-auth/react"
import { CheckCircle2, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAuthModal } from "@/contexts/AuthModalContext"
import { useRelease } from "@/contexts/ReleaseContext"
import { useI18n } from "@/locales/i18n"
import { releaseCopy } from "@/locales/release"
import { RELEASE_ID, type ReleaseMode } from "@/constants/release"
import { trpc } from "@/utils/trpc"

type Sentiment = "good" | "mixed" | "problem"
type InitialFeedback = { sentiment: string; interfaceMode: string; message: string | null } | null

export default function ReleaseFeedbackDialog({
  mode,
  onClose,
}: {
  mode: "submit" | "summary" | "classic"
  onClose: () => void
}) {
  const { locale } = useI18n()
  const copy = releaseCopy[locale]
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <p className="mb-1 font-mono text-xs text-muted-foreground">v{RELEASE_ID}</p>
          <DialogTitle>
            {mode === "summary"
              ? copy.reviewing
              : mode === "classic"
                ? copy.classicTitle
                : copy.feedbackTitle}
          </DialogTitle>
          <DialogDescription>
            {mode === "classic" ? copy.classicDescription : copy.feedbackDescription}
          </DialogDescription>
        </DialogHeader>
        {mode === "summary" ? (
          <ReviewPanel />
        ) : mode === "classic" ? (
          <ClassicReasonPanel onClose={onClose} />
        ) : (
          <FeedbackPanel onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ClassicReasonPanel({ onClose }: { onClose: () => void }) {
  const { data: session, status } = useSession()
  const { locale } = useI18n()
  const copy = releaseCopy[locale]
  if (status === "loading") return <p role="status">{copy.loading}</p>
  if (!session?.user?.id || (session.user.role !== "RENTAL" && session.user.role !== "ADMIN")) {
    return <p className="text-sm text-muted-foreground">{copy.staffOnly}</p>
  }
  // A fresh form for each account: reasons are never persisted in browser storage.
  return <ClassicReasonForm key={session.user.id} userId={session.user.id} onClose={onClose} />
}

function ClassicReasonForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { setMode } = useRelease()
  const { locale } = useI18n()
  const copy = releaseCopy[locale]
  const [reason, setReason] = useState("")
  const utils = trpc.useUtils()
  const submit = trpc.releaseFeedback.submit.useMutation()
  const switchToClassic = () => {
    setMode("classic")
    onClose()
  }
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const message = reason.trim()
    if (!message || submit.isPending) return
    submit.mutate(
      { releaseId: RELEASE_ID, interfaceMode: "classic", sentiment: "mixed", message },
      {
        // Per-call callbacks stop when this keyed form unmounts (including account changes).
        onSuccess: () => {
          void utils.releaseFeedback.getMine.invalidate({ releaseId: RELEASE_ID, userId })
          void utils.releaseFeedback.summary.invalidate({ releaseId: RELEASE_ID })
          switchToClassic()
        },
      },
    )
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <label htmlFor="classic-reason" className="text-sm font-medium">
          {copy.classicReason}
        </label>
        <Textarea
          id="classic-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          maxLength={2000}
          rows={4}
          aria-describedby="classic-reason-help"
        />
        <p id="classic-reason-help" className="text-xs text-muted-foreground">
          {copy.classicReasonHelp}
        </p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{copy.privacy}</p>
      {submit.isError && (
        <p role="alert" className="text-sm text-destructive">
          {copy.classicSaveError}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="submit" disabled={!reason.trim() || submit.isPending}>
          {submit.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {submit.isPending ? copy.saving : copy.saveAndSwitch}
        </Button>
        {submit.isError && (
          <Button type="button" variant="outline" onClick={switchToClassic}>
            {copy.switchWithoutSaving}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onClose}>
          {copy.keepNew}
        </Button>
      </div>
    </form>
  )
}

function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const { data: session, status } = useSession()
  const { openAuthModal } = useAuthModal()
  const { locale } = useI18n()
  const copy = releaseCopy[locale]
  const userId = session?.user?.id ?? ""
  const signedIn = Boolean(userId)
  const canGiveFeedback = session?.user?.role === "RENTAL" || session?.user?.role === "ADMIN"
  const query = trpc.releaseFeedback.getMine.useQuery(
    { releaseId: RELEASE_ID, userId },
    {
      enabled: signedIn && canGiveFeedback,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  )
  // Fetch once on opening before initializing editable state; later refetches must
  // not reset a draft. Account identity is part of the server-validated cache key.
  if (status === "loading") return <p role="status">{copy.loading}</p>
  if (!signedIn)
    return (
      <div className="space-y-4 py-3">
        <p className="text-sm text-muted-foreground">{copy.signInDetail}</p>
        <Button
          onClick={() => {
            onClose()
            openAuthModal()
          }}
        >
          {copy.signIn}
        </Button>
      </div>
    )
  if (!canGiveFeedback) return <p className="text-sm text-muted-foreground">{copy.staffOnly}</p>
  if (query.isPending || !query.isFetchedAfterMount) return <p role="status">{copy.loading}</p>
  if (query.isError)
    return (
      <div className="space-y-3">
        <p role="alert">{copy.error}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {copy.retry}
        </Button>
      </div>
    )
  return (
    <FeedbackForm key={userId} userId={userId} initial={query.data ?? null} onClose={onClose} />
  )
}

function FeedbackForm({
  initial,
  userId,
  onClose,
}: {
  initial: InitialFeedback
  userId: string
  onClose: () => void
}) {
  const { mode } = useRelease()
  const { locale } = useI18n()
  const copy = releaseCopy[locale]
  const [interfaceMode, setInterfaceMode] = useState<ReleaseMode>(
    initial?.interfaceMode === "preview" ? "preview" : initial ? "classic" : mode,
  )
  const [sentiment, setSentiment] = useState<Sentiment | "">(
    (initial?.sentiment as Sentiment) ?? "",
  )
  const [message, setMessage] = useState(initial?.message ?? "")
  const [saved, setSaved] = useState(false)
  const utils = trpc.useUtils()
  const submit = trpc.releaseFeedback.submit.useMutation({
    onSuccess: () => {
      setSaved(true)
      void utils.releaseFeedback.getMine.invalidate({ releaseId: RELEASE_ID, userId })
      void utils.releaseFeedback.summary.invalidate({ releaseId: RELEASE_ID })
    },
  })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!sentiment) return
    submit.mutate({ releaseId: RELEASE_ID, interfaceMode, sentiment, message })
  }
  if (saved)
    return (
      <div className="space-y-4 py-4">
        <CheckCircle2
          className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <p role="status" className="font-medium">
          {copy.saved}
        </p>
        <p className="text-sm text-muted-foreground">{copy.savedDetail}</p>
        <Button onClick={onClose}>{copy.done}</Button>
      </div>
    )
  return (
    <form onSubmit={onSubmit} className="space-y-5 pt-2">
      <div className="space-y-2">
        <label htmlFor="feedback-interface" className="text-sm font-medium">
          {copy.currentView}
        </label>
        <select
          id="feedback-interface"
          value={interfaceMode}
          onChange={(event) => setInterfaceMode(event.target.value as ReleaseMode)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="classic">{copy.classic}</option>
          <option value="preview">{copy.preview}</option>
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{copy.rating}</legend>
        {(["good", "mixed", "problem"] as Sentiment[]).map((value) => (
          <label
            key={value}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${sentiment === value ? "border-foreground bg-accent" : "hover:bg-muted/60"}`}
          >
            <input
              type="radio"
              name="feedback-rating"
              value={value}
              checked={sentiment === value}
              onChange={() => setSentiment(value)}
              required
              className="h-4 w-4 accent-current"
            />
            {copy[value]}
          </label>
        ))}
      </fieldset>
      <div className="space-y-2">
        <label htmlFor="feedback-message" className="text-sm font-medium">
          {copy.message}
        </label>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={2000}
          rows={4}
          aria-describedby="feedback-message-help"
        />
        <p
          id="feedback-message-help"
          className="flex justify-between gap-2 text-xs text-muted-foreground"
        >
          <span>{copy.optional}</span>
          <span className="tabular-nums">{message.length}/2000</span>
        </p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{copy.privacy}</p>
      {submit.isError && (
        <p role="alert" className="text-sm text-destructive">
          {copy.saveError}
        </p>
      )}
      <Button type="submit" disabled={!sentiment || submit.isPending} className="w-full">
        {submit.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {submit.isPending ? copy.saving : copy.send}
      </Button>
    </form>
  )
}

function ReviewPanel() {
  const { data: session } = useSession()
  const { locale, t } = useI18n()
  const copy = releaseCopy[locale]
  const isAdmin = session?.user?.role === "ADMIN"
  const query = trpc.releaseFeedback.summary.useQuery(
    { releaseId: RELEASE_ID },
    { enabled: isAdmin },
  )
  if (!isAdmin) return <p>{t("notAuthorized.adminMessage")}</p>
  if (query.isPending) return <p role="status">{copy.loading}</p>
  if (query.isError)
    return (
      <div className="space-y-3">
        <p role="alert">{copy.error}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {copy.retry}
        </Button>
      </div>
    )
  const summary = query.data
  return (
    <div className="space-y-5">
      <p className="text-sm">
        <strong className="text-2xl tabular-nums">{summary.total}</strong> {copy.responses}
      </p>
      <dl className="grid grid-cols-3 gap-2">
        {(["good", "mixed", "problem"] as Sentiment[]).map((value) => (
          <div key={value} className="rounded-lg border bg-muted/30 p-3">
            <dt className="text-xs text-muted-foreground">{copy[value]}</dt>
            <dd className="mt-2 text-xl font-semibold tabular-nums">{summary.counts[value]}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {copy.classic}: {summary.modes.classic} · {copy.preview}: {summary.modes.preview}
      </p>
      <h4 className="text-sm font-semibold">{copy.recent}</h4>
      {!summary.comments.length && (
        <p className="text-sm text-muted-foreground">{copy.noFeedback}</p>
      )}
      <ul className="space-y-3">
        {summary.comments.map((feedback) => (
          <li key={feedback.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {copy[feedback.interfaceMode as ReleaseMode]} ·{" "}
                {copy[feedback.sentiment as Sentiment]}
              </span>
              <time dateTime={new Date(feedback.updatedAt).toISOString()}>
                {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                  new Date(feedback.updatedAt),
                )}
              </time>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">
              {feedback.message || copy.noComment}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
