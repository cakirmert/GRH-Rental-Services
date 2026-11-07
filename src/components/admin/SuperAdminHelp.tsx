"use client"

import { useState } from "react"
import { Info } from "lucide-react"
import { useI18n } from "@/locales/i18n"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function SuperAdminHelp() {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={t("adminDashboard.members.superAdminHelpLabel")}
            onClick={(event) => {
              // Keep a tap/click alternative to hover and keyboard focus.
              event.preventDefault()
              setOpen((current) => !current)
            }}
          >
            <Info aria-hidden="true" className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-[min(20rem,calc(100vw-2rem))] p-3 leading-relaxed">
          {t("adminDashboard.members.superAdminHelp")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
