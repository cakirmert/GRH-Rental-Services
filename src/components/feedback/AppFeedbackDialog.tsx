"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { CheckCircle2, ExternalLink, Globe2, Loader2 } from "lucide-react"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { appFeedbackCopy } from "@/locales/app-feedback"
import { useView, View } from "@/contexts/ViewContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type DeliveryResult = {
  id: string
  status: "queued" | "published" | "needs_review"
  issueUrl: string | null
}
type FormErrors = { title?: string; description?: string; consent?: string }

export default function AppFeedbackDialog({
  open,
  onOpenChange,
  onRestoreFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestoreFocus: () => void
}) {
  const { locale } = useI18n()
  const { setView } = useView()
  const copy = appFeedbackCopy[locale]
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [category, setCategory] = useState<"problem" | "feedback">("problem")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [result, setResult] = useState<DeliveryResult | null>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const descriptionInput = useRef<HTMLTextAreaElement>(null)
  const consentInput = useRef<HTMLInputElement>(null)
  const successMessage = useRef<HTMLDivElement>(null)
  const mutation = trpc.problemReports.submit.useMutation()
  // A failed request may already have been saved. Retry its unchanged UUID/payload.
  const locked = mutation.isPending || !!mutation.error

  useEffect(() => {
    if (!open) return
    if (result) successMessage.current?.focus()
    else titleInput.current?.focus()
  }, [open, result])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (mutation.isPending) return
    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    const nextErrors: FormErrors = {}
    if (
      trimmedTitle.length < 5 ||
      trimmedTitle.length > 120 ||
      /[\u0000-\u001f\u007f]/.test(trimmedTitle)
    )
      nextErrors.title = copy.titleRequired
    if (
      trimmedDescription.length < 20 ||
      trimmedDescription.length > 4000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmedDescription)
    )
      nextErrors.description = copy.detailsRequired
    if (!consent) nextErrors.consent = copy.consentRequired
    setErrors(nextErrors)
    if (nextErrors.title) {
      titleInput.current?.focus()
      return
    }
    if (nextErrors.description) {
      descriptionInput.current?.focus()
      return
    }
    if (nextErrors.consent) {
      consentInput.current?.focus()
      return
    }
    mutation.mutate(
      {
        requestId,
        category,
        title: trimmedTitle,
        description: trimmedDescription,
        publicPostingConsent: true,
      },
      {
        // These per-call callbacks stop when the account-keyed form unmounts.
        onSuccess: (data) => {
          setResult(data)
          setTitle("")
          setDescription("")
          setConsent(false)
        },
      },
    )
  }

  function newReport() {
    mutation.reset()
    setResult(null)
    setErrors({})
    setRequestId(crypto.randomUUID())
    setCategory("problem")
  }

  const publicIssue =
    result?.status === "published" &&
    result.issueUrl?.startsWith("https://github.com/cakirmert/GRH-Rental-Services/issues/")
      ? result.issueUrl
      : null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next)
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-xl sm:max-w-lg"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onRestoreFocus()
        }}
      >
        <DialogHeader className="pr-3 text-left">
          <DialogTitle>{result ? copy.success : copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-5">
            <div
              ref={successMessage}
              tabIndex={-1}
              role="status"
              className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4"
            >
              <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm leading-relaxed">
                {result.status === "published"
                  ? copy.published
                  : result.status === "needs_review"
                    ? copy.needsReview
                    : copy.queued}
              </p>
            </div>
            {publicIssue && (
              <a
                href={publicIssue}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-sm text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copy.openIssue}
                <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0" />
              </a>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={newReport}>
                {copy.another}
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {copy.close}
              </Button>
            </div>
          </div>
        ) : (
          <form noValidate onSubmit={submit} className="space-y-4">
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-xs leading-relaxed dark:border-amber-700 dark:bg-amber-950/20">
              <p className="flex items-start gap-2 text-sm font-medium">
                <Globe2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                {copy.publicTitle}
              </p>
              <p>{copy.publicBody}</p>
              <p>
                {copy.privateHelp}{" "}
                <Link
                  href="/?contact"
                  prefetch={false}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                    event.preventDefault()
                    if (mutation.isPending) return
                    setView(View.CONTACT)
                    onOpenChange(false)
                  }}
                  className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copy.contact}
                </Link>
                .
              </p>
            </div>
            <fieldset disabled={locked} className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{copy.category}</legend>
              <div className="flex flex-wrap gap-2">
                {(["problem", "feedback"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-muted/50 has-disabled:cursor-default"
                  >
                    <input
                      type="radio"
                      name="app-report-category"
                      value={value}
                      checked={category === value}
                      onChange={() => setCategory(value)}
                      className="h-4 w-4 accent-primary"
                    />
                    {copy[value]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2">
              <label htmlFor="app-report-title" className="text-sm font-medium">
                {copy.summary}
              </label>
              <Input
                ref={titleInput}
                id="app-report-title"
                name="report-title"
                value={title}
                maxLength={120}
                minLength={5}
                required
                autoComplete="off"
                readOnly={locked}
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? "app-report-title-error" : "app-report-title-help"}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setErrors((old) => ({ ...old, title: undefined }))
                }}
              />
              {errors.title ? (
                <p id="app-report-title-error" className="text-xs text-destructive">
                  {errors.title}
                </p>
              ) : (
                <p id="app-report-title-help" className="text-xs text-muted-foreground">
                  {copy.summaryHint}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="app-report-details" className="text-sm font-medium">
                {copy.details}
              </label>
              <Textarea
                ref={descriptionInput}
                id="app-report-details"
                name="report-details"
                value={description}
                rows={4}
                maxLength={4000}
                minLength={20}
                required
                autoComplete="off"
                readOnly={locked}
                aria-invalid={!!errors.description}
                aria-describedby={
                  errors.description ? "app-report-details-error" : "app-report-details-help"
                }
                onChange={(event) => {
                  setDescription(event.target.value)
                  setErrors((old) => ({ ...old, description: undefined }))
                }}
              />
              {errors.description ? (
                <p id="app-report-details-error" className="text-xs text-destructive">
                  {errors.description}
                </p>
              ) : (
                <p
                  id="app-report-details-help"
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  {copy.detailsHint}
                </p>
              )}
            </div>
            <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <p>{copy.metadata}</p>
              <p>{copy.retention}</p>
            </div>
            <div>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-relaxed">
                <input
                  ref={consentInput}
                  type="checkbox"
                  name="public-posting-consent"
                  checked={consent}
                  required
                  disabled={locked}
                  aria-invalid={!!errors.consent}
                  aria-describedby={errors.consent ? "app-report-consent-error" : undefined}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  onChange={(event) => {
                    setConsent(event.target.checked)
                    setErrors((old) => ({ ...old, consent: undefined }))
                  }}
                />
                <span>{copy.consent}</span>
              </label>
              {errors.consent && (
                <p id="app-report-consent-error" className="mt-2 text-xs text-destructive">
                  {errors.consent}
                </p>
              )}
            </div>
            {mutation.error && (
              <div
                role="alert"
                className="space-y-1 rounded-lg border border-destructive/30 p-3 text-sm"
              >
                <p className="text-destructive">
                  {mutation.error.data?.code === "TOO_MANY_REQUESTS" ? copy.rateLimit : copy.error}
                </p>
                <p className="text-xs text-muted-foreground">{copy.retryHint}</p>
              </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => onOpenChange(false)}
              >
                {copy.close}
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  />
                )}
                {mutation.isPending ? copy.sending : copy.send}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
