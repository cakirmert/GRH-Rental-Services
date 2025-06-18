"use client"
import { useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  BookOpen,
  Play,
  Lightbulb,
  HelpCircle,
} from "lucide-react"

export interface OnboardingStep {
  selector: string
  index: number
}

interface OnboardingOverlayProps {
  steps: OnboardingStep[]
  visible: boolean
  mode?: "tour" | "help"
  title?: string
  description?: string
  helpSteps?: string[]
  onClose?: () => void
  onStartTour?: () => void
  hasSeenTour?: boolean
  t?: (key: string) => string
}

export default function OnboardingOverlay({
  steps,
  visible,
  mode = "tour",
  title = "",
  description = "",
  helpSteps = [],
  onClose,
  onStartTour,
  hasSeenTour = false,
  t = (key: string) => key,
}: OnboardingOverlayProps) {
  const [rects, setRects] = useState<(DOMRect | null)[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [isCompleted, setIsCompleted] = useState(false)

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      setIsCompleted(true)
    }
  }, [currentStep, steps.length])

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }, [currentStep])

  const closeOverlay = useCallback(() => {
    setIsCompleted(true)
    onClose?.()
  }, [onClose])

  const startTour = useCallback(() => {
    setCurrentStep(0)
    setIsCompleted(false)
    onStartTour?.()
  }, [onStartTour])

  useEffect(() => {
    if (visible) {
      setCurrentStep(0)
      setIsCompleted(false)
    }
  }, [visible])

  // Handle keyboard navigation
  useEffect(() => {
    if (!visible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          closeOverlay()
          break
        case "ArrowRight":
        case " ":
          if (mode === "tour") {
            e.preventDefault()
            nextStep()
          }
          break
        case "ArrowLeft":
          if (mode === "tour") {
            e.preventDefault()
            prevStep()
          }
          break
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [visible, mode, closeOverlay, nextStep, prevStep])

  useEffect(() => {
    function update() {
      const newRects = steps.map((step) => {
        const el = document.querySelector<HTMLElement>(step.selector)
        if (el && visible) {
          // Remove previous highlights
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background")

          // Add highlight to current step
          if (step.index === currentStep + 1) {
            el.classList.add(
              "ring-2",
              "ring-blue-500",
              "ring-offset-2",
              "ring-offset-background",
              "relative",
              "z-30",
            )
          }
        }
        return el?.getBoundingClientRect() || null
      })
      setRects(newRects)
    }

    update()
    if (visible) {
      window.addEventListener("resize", update)
      window.addEventListener("scroll", update)
    }

    return () => {
      // Clean up all highlights
      steps.forEach((step) => {
        const el = document.querySelector<HTMLElement>(step.selector)
        el?.classList.remove(
          "ring-2",
          "ring-blue-500",
          "ring-primary",
          "ring-offset-2",
          "ring-offset-background",
          "relative",
          "z-30",
        )
      })
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update)
    }
  }, [steps, visible, currentStep])

  if (!visible || isCompleted) return null

  // Show help mode or tour mode
  if (mode === "help") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto bg-black/20 backdrop-blur-sm">
        <Card className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 max-w-md mx-4 max-h-[80vh] overflow-auto">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeOverlay}
                className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Start Tour Button */}
            <div className="mb-6">
              <Button
                onClick={startTour}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white transition-all duration-200"
                size="lg"
              >
                <Play className="mr-2 h-4 w-4" />
                {hasSeenTour
                  ? t("helpPage.restartTour") || "Restart Interactive Tour"
                  : t("helpPage.startTour") || "Start Interactive Tour"}
              </Button>

              {!hasSeenTour && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950 p-3 rounded-lg border border-amber-200 dark:border-amber-800 mt-4">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span>
                    {t("helpPage.newUserPrompt") ||
                      "New to this dashboard? Try the interactive tour!"}
                  </span>
                </div>
              )}
            </div>

            {/* Help Steps */}
            <div>
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">
                {t("helpPage.quickReference") || "Quick Reference"}
              </h4>
              <ol className="space-y-3 text-sm">
                {helpSteps.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3 group">
                    <Badge
                      variant="secondary"
                      className="mt-0.5 min-w-[24px] h-6 flex items-center justify-center text-xs font-semibold transition-all duration-200 group-hover:scale-110"
                    >
                      {idx + 1}
                    </Badge>
                    <span className="leading-6 group-hover:text-foreground transition-colors duration-200">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Additional Help */}
            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <HelpCircle className="h-4 w-4" />
                <span>
                  {t("helpPage.needMoreHelp") || "Need more help? Contact your administrator."}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currentRect = rects[currentStep]
  const currentStepData = steps[currentStep]

  return createPortal(
    <>
      {/* Step indicators and current step highlight */}
      <div className="pointer-events-none fixed inset-0 z-50">
        {rects.map((rect, i) =>
          rect && i !== currentStep ? (
            <div
              key={i}
              className="absolute flex h-6 w-6 items-center justify-center rounded-full bg-gray-500 text-[11px] font-bold text-white opacity-50"
              style={{ top: rect.top + window.scrollY - 12, left: rect.left + window.scrollX - 12 }}
            >
              {steps[i].index}
            </div>
          ) : null,
        )}

        {/* Current step highlight */}
        {currentRect && (
          <div
            className="absolute flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-[12px] font-bold text-white animate-pulse border-2 border-white"
            style={{
              top: currentRect.top + window.scrollY - 16,
              left: currentRect.left + window.scrollX - 16,
            }}
          >
            {currentStepData.index}
          </div>
        )}
      </div>

      {/* Tour control panel */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 pointer-events-auto animate-in slide-in-from-bottom-4 duration-300">
        <Card className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 max-w-md">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {currentStep + 1} of {steps.length}
                </Badge>
                <div className="text-sm font-semibold">Interactive Tour</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeOverlay}
                className="h-8 w-8 p-0 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              />
            </div>

            {/* Current step description */}
            <div className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              {helpSteps[currentStep] ||
                `Step ${currentStep + 1}: Look for the highlighted element on the page.`}
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-6 flex items-center gap-4">
              <span>Use ← → arrows or spacebar to navigate</span>
              <span>Press ESC to close</span>
            </div>

            {/* Navigation buttons */}
            <div className="flex justify-between items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={prevStep}
                disabled={currentStep === 0}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              <div className="flex gap-1">
                {steps.map((_, index) => (
                  <div
                    key={index}
                    className={`h-2 w-2 rounded-full transition-all duration-200 ${
                      index <= currentStep ? "bg-blue-500" : "bg-gray-300"
                    }`}
                  />
                ))}
              </div>

              <Button
                size="sm"
                onClick={nextStep}
                className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600"
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    <Check className="h-4 w-4" />
                    Finish
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>,
    document.body,
  )
}
