"use client"

import { useState } from "react"
import { Check, LockKeyhole } from "lucide-react"
import { useI18n } from "@/locales/i18n"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { useCurrentAccount } from "@/features/identity/client"
import { Container } from "@/components/ui/container"
import { CloudflareTurnstile } from "@/components/CloudflareTurnstile"
import { useToast } from "@/components/ui/use-toast"

export default function ContactPage() {
  const { user, status } = useCurrentAccount()
  return (
    <ContactForm
      key={user?.id ?? "guest"}
      accountEmail={user?.email ?? ""}
      accountName={user?.name ?? ""}
      accountLoading={status === "loading"}
    />
  )
}

function ContactForm({
  accountEmail,
  accountName,
  accountLoading,
}: {
  accountEmail: string
  accountName: string
  accountLoading: boolean
}) {
  const { t } = useI18n()
  const { toast } = useToast()

  const [draft, setForm] = useState({
    email: "",
    name: accountName,
    room: "",
    issue: "",
    message: "",
  })
  const form = { ...draft, email: accountEmail || draft.email }

  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const turnstileEnabled = Boolean(turnstileSiteKey)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: "" })) // Clear error on change
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (accountLoading || isSubmitting) return
    const newErrors: { [key: string]: string } = {}

    if (!form.name.trim()) newErrors.name = t("contact.required.name")
    if (!form.room.trim()) newErrors.room = t("contact.required.room")
    if (!form.issue) newErrors.issue = t("contact.required.issue")
    if (!form.email.trim()) newErrors.email = t("contact.required.email")
    if (!form.message.trim()) newErrors.message = t("contact.required.message")

    if (turnstileEnabled && !turnstileToken) {
      toast({
        title: t("contact.sendErrorTitle"),
        description: t("contact.verificationRequired"),
        variant: "destructive",
      })
      return
    }

    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) {
      const field = e.currentTarget.querySelector<HTMLElement>(
        `[name="${Object.keys(newErrors)[0]}"]`,
      )
      field?.focus()
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          turnstileToken: turnstileToken ?? undefined,
        }),
      })

      if (response.ok) {
        setSubmitted(true)
      } else {
        toast({
          title: t("contact.sendErrorTitle"),
          description: response.status === 429 ? t("contact.rateLimited") : t("contact.sendError"),
          variant: "destructive",
        })
        if (turnstileEnabled) {
          setTurnstileToken(null)
          setTurnstileResetKey((k) => k + 1)
        }
      }
    } catch {
      toast({
        title: t("contact.sendErrorTitle"),
        description: t("contact.sendError"),
        variant: "destructive",
      })
      if (turnstileEnabled) {
        setTurnstileToken(null)
        setTurnstileResetKey((k) => k + 1)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <Container className="max-w-2xl py-8 md:py-12">
        <Card className="p-6 sm:p-8" role="status">
          <Check className="mb-4 size-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("contact.thankYouTitle")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t("contact.thankYouMsg")}
          </p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => {
              setForm((previous) => ({ ...previous, issue: "", message: "" }))
              setTurnstileToken(null)
              setTurnstileResetKey((key) => key + 1)
              setSubmitted(false)
            }}
          >
            {t("contact.sendAnother")}
          </Button>
        </Card>
      </Container>
    )
  }

  return (
    <Container className="max-w-2xl py-8 md:py-12">
      <Card>
        <CardHeader className="space-y-2 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">{t("contact.formTitle")}</h1>
          <CardDescription className="leading-relaxed">{t("contact.description")}</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="px-6 pb-6 sm:px-8">
            <fieldset
              disabled={isSubmitting || accountLoading}
              aria-busy={isSubmitting || accountLoading}
              className="min-w-0 space-y-5"
            >
              <div className="grid gap-5 sm:grid-cols-[1.5fr_1fr]">
                {/* Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("contact.nameLabel")}</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder={t("contact.namePlaceholder")}
                    value={form.name}
                    onChange={handleChange}
                    autoComplete="name"
                    maxLength={100}
                    required
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? "name-error" : undefined}
                  />
                  {errors.name && (
                    <p id="name-error" className="text-destructive text-sm">
                      {errors.name}
                    </p>
                  )}
                </div>

                {/* Room */}
                <div className="space-y-1.5">
                  <Label htmlFor="room">{t("contact.roomLabel")}</Label>
                  <Input
                    id="room"
                    name="room"
                    placeholder={t("contact.roomPlaceholder")}
                    value={form.room}
                    onChange={handleChange}
                    maxLength={50}
                    required
                    aria-invalid={Boolean(errors.room)}
                    aria-describedby={errors.room ? "room-error" : undefined}
                  />
                  {errors.room && (
                    <p id="room-error" className="text-destructive text-sm">
                      {errors.room}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                {accountEmail ? (
                  <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-3">
                    <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <LockKeyhole className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("contact.accountEmail")}
                    </p>
                    <p id="email" className="mt-1 break-all text-sm">
                      {accountEmail}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t("contact.accountEmailHint")}
                    </p>
                  </div>
                ) : (
                  <>
                    <Label htmlFor="email">{t("common.email")}</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      placeholder={t("common.emailPlaceholder")}
                      value={form.email}
                      onChange={handleChange}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? "email-error" : undefined}
                    />
                  </>
                )}
                {errors.email && (
                  <p id="email-error" className="text-destructive text-sm">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <Label htmlFor="issue">{t("contact.subjectLabel")}</Label>
                <select
                  id="issue"
                  name="issue"
                  value={form.issue}
                  onChange={handleChange}
                  required
                  aria-invalid={Boolean(errors.issue)}
                  aria-describedby={errors.issue ? "issue-error" : undefined}
                  className="h-10 w-full rounded-md border border-input bg-background/50 px-3 text-base text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:text-sm"
                >
                  <option value="" disabled>
                    {t("contact.subjectPlaceholder")}
                  </option>
                  <option value="suggestion">{t("contact.subject.suggestion")}</option>
                  <option value="complaint">{t("contact.subject.complaint")}</option>
                  <option value="inquiry">{t("contact.subject.inquiry")}</option>
                  <option value="urgent">{t("contact.subject.urgent")}</option>
                  <option value="other">{t("contact.subject.other")}</option>
                </select>
                {errors.issue && (
                  <p id="issue-error" className="text-destructive text-sm">
                    {errors.issue}
                  </p>
                )}
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <Label htmlFor="message">{t("contact.messageLabel")}</Label>
                <Textarea
                  id="message"
                  name="message"
                  rows={5}
                  placeholder={t("contact.messagePlaceholder")}
                  value={form.message}
                  onChange={handleChange}
                  maxLength={1000}
                  required
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={errors.message ? "message-error" : undefined}
                  className="min-h-36 resize-y"
                />
                {errors.message && (
                  <p id="message-error" className="text-destructive text-sm">
                    {errors.message}
                  </p>
                )}
                <p className="text-right text-xs tabular-nums text-muted-foreground">
                  {form.message.length} / 1000
                </p>
              </div>

              {/* Turnstile */}
              {turnstileSiteKey && (
                <div className="flex justify-center pt-2">
                  <CloudflareTurnstile
                    key={turnstileResetKey}
                    siteKey={turnstileSiteKey}
                    onToken={setTurnstileToken}
                  />
                </div>
              )}
            </fieldset>
          </CardContent>

          <CardFooter className="flex-col items-stretch gap-4 border-t border-border/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("contact.replyHint")}
            </p>
            <Button
              type="submit"
              className="shrink-0"
              disabled={accountLoading || isSubmitting || (turnstileEnabled && !turnstileToken)}
            >
              {isSubmitting ? t("contact.sending") : t("contact.submit")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </Container>
  )
}
