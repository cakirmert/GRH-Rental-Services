"use client"

import { useEffect, useState } from "react"
import { useI18n } from "@/locales/i18n"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { useSession } from "next-auth/react"
import { Container } from "@/components/ui/container"

export default function ContactPage() {
  const { t } = useI18n()
  const { data: session } = useSession()

  const [form, setForm] = useState({
    email: "",
    name: "",
    room: "",
    issue: "",
    message: "",
  })

  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [submitted, setSubmitted] = useState(false)
  useEffect(() => {
    if (session?.user?.email) {
      setForm((prev) => ({ ...prev, email: session.user.email || "" }))
    }
  }, [session])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => ({ ...prev, [name]: "" })) // Clear error on change
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: { [key: string]: string } = {}

    if (!form.name.trim()) newErrors.name = t("required.name")
    if (!form.room.trim()) newErrors.room = t("required.room")
    if (!form.issue) newErrors.issue = t("required.issue")
    if (!form.email.trim()) newErrors.email = t("required.email")
    if (!form.message.trim()) newErrors.message = t("required.message")

    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })

    setSubmitted(true)
  }

  if (submitted) {
    return (
      <Container className="max-w-lg py-16 text-center">
        <h2 className="text-2xl font-semibold text-foreground mb-2">
          {t("contact.thankYouTitle") || "Thank you for reaching out!"}
        </h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          {t("contact.thankYouMsg") || "We will get back to you as soon as possible via e‑mail."}
        </p>
        <Button onClick={() => setSubmitted(false)}>
          {t("contact.sendAnother") || "Send another message"}
        </Button>
      </Container>
    )
  }

  return (
    <Container className="max-w-lg py-8 md:py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-center">{t("contact.formTitle")}</CardTitle>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="font-medium">
                {t("contact.nameLabel")}
              </label>
              <Input
                id="name"
                name="name"
                placeholder={t("contact.namePlaceholder")}
                value={form.name}
                onChange={handleChange}
              />
              {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}
            </div>

            {/* Room */}
            <div className="space-y-1.5">
              <label htmlFor="room" className="font-medium">
                {t("contact.roomLabel")}
              </label>
              <Input
                id="room"
                name="room"
                placeholder={t("contact.roomPlaceholder")}
                value={form.room}
                onChange={handleChange}
              />
              {errors.room && <p className="text-red-500 text-sm">{errors.room}</p>}
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label htmlFor="issue" className="font-medium">
                {t("contact.subjectLabel")}
              </label>
              <select
                id="issue"
                name="issue"
                value={form.issue}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring focus:ring-primary/40 bg-background text-foreground"
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
              {errors.issue && <p className="text-red-500 text-sm">{errors.issue}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5 pt-4">
              <label htmlFor="email" className="font-medium">
                {t("common.email")}
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={t("common.emailPlaceholder")}
                value={form.email}
                onChange={handleChange}
                readOnly={!!session?.user?.email}
              />
              {errors.email && <p className="text-red-500 text-sm">{errors.email}</p>}
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label htmlFor="message" className="font-medium">
                {t("contact.messageLabel")}
              </label>
              <Textarea
                id="message"
                name="message"
                rows={5}
                placeholder={t("contact.messagePlaceholder")}
                value={form.message}
                onChange={handleChange}
                className="resize-none"
              />
              {errors.message && <p className="text-red-500 text-sm">{errors.message}</p>}
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full">
              {t("contact.submit")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </Container>
  )
}
