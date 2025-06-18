"use client"

import { HelpCircle, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import OnboardingOverlay, { OnboardingStep } from "./OnboardingOverlay"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/locales/i18n"

interface DashboardHelpSheetProps {
  role: "rental" | "admin"
}

export default function DashboardHelpSheet({ role }: DashboardHelpSheetProps) {
  const { t } = useI18n()
  const [helpMode, setHelpMode] = useState<"off" | "tour" | "help">("off")
  const [hasSeenTour, setHasSeenTour] = useState(false)

  // Check if user has seen the tour before
  useEffect(() => {
    const tourKey = `onboarding_${role}_seen`
    const seen = localStorage.getItem(tourKey) === "true"
    setHasSeenTour(seen)
  }, [role])

  const markTourAsSeen = () => {
    const tourKey = `onboarding_${role}_seen`
    localStorage.setItem(tourKey, "true")
    setHasSeenTour(true)
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
          "helpPage.rentalStep1",
          "helpPage.rentalStep2",
          "helpPage.rentalStep3",
          "helpPage.rentalStep4",
          "helpPage.rentalStep5",
        ]
      : [
          "helpPage.adminStep1",
          "helpPage.adminStep2",
          "helpPage.adminStep3",
          "helpPage.adminStep4",
          "helpPage.adminStep5",
          "helpPage.adminStep6",
        ]

  const highlightSteps: OnboardingStep[] =
    role === "rental"
      ? [
          { selector: "#rental-booking-list .accept-btn", index: 1 },
          { selector: "#rental-view-tabs", index: 2 },
          { selector: "#rental-filter-card", index: 3 },
          { selector: "#rental-booking-list .booking-chat-btn", index: 4 },
          { selector: "#rental-refresh-btn", index: 5 },
        ]
      : [
          { selector: "#admin-dashboard-stats", index: 1 },
          { selector: "#admin-quick-items", index: 2 },
          { selector: "#admin-quick-members", index: 3 },
          { selector: "#admin-quick-assignees", index: 4 },
          { selector: "#admin-quick-calendar", index: 5 },
          { selector: "#admin-quick-cancellations", index: 6 },
        ]

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
                  variant="default"
                  size="sm"
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 animate-pulse"
                >
                  <Play className="mr-2 h-4 w-4" />
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
                variant="outline"
                size="icon"
                className="h-9 w-9 relative transition-all duration-200 hover:scale-105 hover:shadow-md border-2"
              >
                <HelpCircle className="h-4 w-4" />
                {!hasSeenTour && (
                  <div className="absolute -top-1 -right-1 h-3 w-3 bg-blue-500 rounded-full animate-pulse" />
                )}
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
        helpSteps={steps.map((key) => t(key))}
        onClose={closeOverlay}
        onStartTour={startTour}
        hasSeenTour={hasSeenTour}
        t={t}
      />
    </>
  )
}
