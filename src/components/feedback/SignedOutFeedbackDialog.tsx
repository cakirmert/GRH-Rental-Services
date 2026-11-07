"use client"

import { useRef } from "react"
import { useAuthModal } from "@/contexts/AuthModalContext"
import { usePrivateContactNavigation } from "./usePrivateContactNavigation"
import { useI18n } from "@/locales/i18n"
import { appFeedbackCopy } from "@/locales/app-feedback"
import { Button } from "@/components/ui/button"
import { RENTAL_CONTACT_EMAIL } from "@/constants/contact"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function SignedOutFeedbackDialog({
  open,
  onOpenChange,
  onRestoreFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestoreFocus: () => void
}) {
  const { locale } = useI18n()
  const copy = appFeedbackCopy[locale]
  const { openAuthModal } = useAuthModal()
  const openPrivateContact = usePrivateContactNavigation()
  const handingOff = useRef(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-xl sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (!handingOff.current) onRestoreFocus()
          handingOff.current = false
        }}
      >
        <DialogHeader className="pr-3 text-left">
          <DialogTitle>{copy.report}</DialogTitle>
          <DialogDescription>{copy.signedOutDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">{copy.signedOutHelp}</p>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="h-auto min-h-10 whitespace-normal text-center"
              onClick={() => {
                handingOff.current = true
                onOpenChange(false)
                openPrivateContact()
              }}
            >
              {copy.privateContact}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 whitespace-normal text-center"
              onClick={() => {
                handingOff.current = true
                onOpenChange(false)
                openAuthModal("email", "", onRestoreFocus)
              }}
            >
              {copy.signInToReport}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {copy.emailFallback}{" "}
            <a
              href={`mailto:${RENTAL_CONTACT_EMAIL}`}
              className="rounded-sm underline underline-offset-4 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {RENTAL_CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
