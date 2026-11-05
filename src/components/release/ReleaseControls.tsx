"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { FlaskConical, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRelease } from "@/contexts/ReleaseContext"
import { useI18n } from "@/locales/i18n"
import { releaseCopy } from "@/locales/release"
import { RELEASE_ID, type ReleaseMode } from "@/constants/release"

const FeedbackDialog = dynamic(() => import("./ReleaseFeedbackDialog"))

export default function ReleaseControls() {
  const { mode, setMode } = useRelease()
  const { locale } = useI18n()
  const copy = releaseCopy[locale]
  const { data: session } = useSession()
  const [dialog, setDialog] = useState<"submit" | "summary" | null>(null)
  if (session?.user?.role !== "RENTAL" && session?.user?.role !== "ADMIN") return null
  return (
    <section aria-labelledby="release-title" className="mt-8 rounded-xl border bg-background/70 p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            <FlaskConical className="h-4 w-4" aria-hidden="true" /> v{RELEASE_ID}
          </p>
          <h3 id="release-title" className="text-base font-semibold">{copy.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div role="group" aria-label={copy.selection} className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
            {(["classic", "preview"] as ReleaseMode[]).map(value => (
              <Button key={value} type="button" size="sm" variant={mode === value ? "default" : "ghost"}
                aria-pressed={mode === value} onClick={() => setMode(value)} className="h-9">
                {copy[value]}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDialog("submit")}>
              <MessageSquare aria-hidden="true" /> {copy.feedback}
            </Button>
            {session?.user?.role === "ADMIN" && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setDialog("summary")}>{copy.review}</Button>
            )}
          </div>
        </div>
      </div>
      {dialog && <FeedbackDialog mode={dialog} onClose={() => setDialog(null)} />}
    </section>
  )
}
