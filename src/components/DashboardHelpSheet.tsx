"use client"

import { HelpCircle, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useCallback, useSyncExternalStore } from "react"
import OnboardingOverlay, { OnboardingStep } from "./OnboardingOverlay"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/locales/i18n"

interface DashboardHelpSheetProps {
  role: "rental" | "admin"
}

const seenEvent = "grh-dashboard-tour-seen"
const transientSeen = new Set<string>()
const unseenOnServer = () => false
function subscribeToTourSeen(notify: () => void) {
  window.addEventListener("storage", notify)
  window.addEventListener(seenEvent, notify)
  return () => {
    window.removeEventListener("storage", notify)
    window.removeEventListener(seenEvent, notify)
  }
}

export default function DashboardHelpSheet(props: DashboardHelpSheetProps) {
  return <DashboardHelp key={props.role} {...props} />
}

function DashboardHelp({ role }: DashboardHelpSheetProps) {
  const { t } = useI18n()
  const [helpMode, setHelpMode] = useState<"off" | "tour" | "help">("off")
  const tourKey = `onboarding_${role}_seen`
  const getSeen = useCallback(() => {
    try {
      return localStorage.getItem(tourKey) === "true"
    } catch {
      return transientSeen.has(tourKey)
    }
  }, [tourKey])
  const hasSeenTour = useSyncExternalStore(subscribeToTourSeen, getSeen, unseenOnServer)

  const markTourAsSeen = () => {
    try {
      localStorage.setItem(tourKey, "true")
    } catch {
      transientSeen.add(tourKey)
    }
    window.dispatchEvent(new Event(seenEvent))
  }

  const startTour = () => {
    markTourAsSeen()
    setHelpMode("tour")
  }

  const showHelp = () => {
    setHelpMode("help")
  }

  const closeOverlay = () => {
    setHelpMode("off")
  }

  const titleKey = role === "rental" ? "helpPage.rentalTitle" : "helpPage.adminTitle"
  const descriptionKey =
    role === "rental" ? "helpPage.rentalDescription" : "helpPage.adminDescription"
  const steps =
    role === "rental"
      ? [
          { selector: "#rental-booking-list .accept-btn", text: "helpPage.rentalStep1" },
          { selector: "#rental-view-tabs", text: "helpPage.rentalStep2" },
          { selector: "#rental-filter-card", text: "helpPage.rentalStep3" },
          { selector: "#rental-booking-list .booking-chat-btn", text: "helpPage.rentalStep4" },
          { selector: "#rental-refresh-btn", text: "helpPage.rentalStep5" },
        ]
      : [
          { selector: "#admin-dashboard-stats", text: "helpPage.adminStep1" },
          { selector: "#admin-quick-items", text: "helpPage.adminStep2" },
          { selector: "#admin-quick-members", text: "helpPage.adminStep3" },
          { selector: "#admin-quick-inactive", text: "helpPage.adminStepInactive" },
          { selector: "#admin-quick-assignees", text: "helpPage.adminStep4" },
          { selector: "#admin-quick-calendar", text: "helpPage.adminStep5" },
          { selector: "#admin-quick-cancellations", text: "helpPage.adminStep6" },
        ]

  const highlightSteps: OnboardingStep[] = steps.map(({ selector }, index) => ({
    selector,
    index: index + 1,
  }))

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Quick Tour Button for new users */}
        {!hasSeenTour && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={startTour}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="font-normal text-muted-foreground hover:text-foreground"
                >
                  <Play aria-hidden="true" className="h-4 w-4" />
                  {t("helpPage.quickTour") || "Quick Tour"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{t("helpPage.quickTourTooltip") || "Take a quick tour of this dashboard"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Main Help Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={showHelp}
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
              >
                <HelpCircle className="h-4 w-4" />
                <span className="sr-only">{t("common.help")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {t("common.help")} & {t("helpPage.onboarding") || "Onboarding"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <OnboardingOverlay
        steps={highlightSteps}
        visible={helpMode !== "off"}
        mode={helpMode === "help" ? "help" : "tour"}
        title={t(titleKey)}
        description={t(descriptionKey)}
        helpSteps={steps.map(({ text }) => t(text))}
        onClose={closeOverlay}
        onStartTour={startTour}
        hasSeenTour={hasSeenTour}
        t={t}
      />
    </>
  )
}
