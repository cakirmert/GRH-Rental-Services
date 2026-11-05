"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRelease } from "@/contexts/ReleaseContext"
import { useI18n } from "@/locales/i18n"
import { releaseCopy } from "@/locales/release"

const FeedbackDialog = dynamic(() => import("./ReleaseFeedbackDialog"))

export default function ReleaseControls() {
  const { mode, setMode } = useRelease()
  const { locale } = useI18n()
  const copy = releaseCopy[locale]
  const { data: session, status } = useSession()
  const [dialog, setDialog] = useState<"submit" | "summary" | "classic" | null>(null)
  if (
    status === "loading" ||
    !session?.user?.id ||
    (session.user.role !== "RENTAL" && session.user.role !== "ADMIN")
  )
    return null
  return (
    <section
      aria-label={copy.controls}
      className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setDialog("submit")}
        className="min-h-9 text-muted-foreground"
      >
        <MessageSquare aria-hidden="true" /> {copy.feedback}
      </Button>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="min-h-9 text-muted-foreground"
        onClick={() => (mode === "classic" ? setMode("preview") : setDialog("classic"))}
      >
        {mode === "classic" ? copy.useNew : copy.useClassic}
      </Button>
      {session.user.role === "ADMIN" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-9 text-muted-foreground"
          onClick={() => setDialog("summary")}
        >
          {copy.review}
        </Button>
      )}
      {dialog && (
        <FeedbackDialog
          key={`${session.user.id}:${dialog}`}
          mode={dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  )
}
