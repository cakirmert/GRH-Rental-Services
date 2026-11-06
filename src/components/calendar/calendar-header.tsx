"use client"

import { useId } from "react"
import { addDays, addMonths, addWeeks } from "date-fns"
import { ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react"
import { useCalendar, type CalendarView } from "./calendar-provider"
import { calendarLocale, weekLabel } from "./calendar-utils"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"
import { cn } from "@/lib/utils"
import { formatInBerlin as format, parseBerlinDateTime, toBerlinDate } from "@/lib/berlin-time"

export function CalendarHeader({ onBlockSlot }: { onBlockSlot?: () => void }) {
  const { currentDate, setCurrentDate, view, setView, selectedDate, setSelectedDate } =
    useCalendar()
  const { t, locale } = useI18n()
  const dateInputId = useId()
  const options = { locale: calendarLocale(locale) }
  const title =
    view === "month"
      ? format(currentDate, "MMMM yyyy", options)
      : view === "day"
        ? format(currentDate, "EEEE, d MMM yyyy", options)
        : weekLabel(currentDate, locale)

  function navigate(direction: number) {
    setCurrentDate(
      view === "month"
        ? addMonths(currentDate, direction)
        : view === "day"
          ? addDays(currentDate, direction)
          : addWeeks(currentDate, direction),
    )
    setSelectedDate(null)
  }

  return (
    <div className="space-y-4 border-b px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t("calendar.eyebrow")}
          </p>
          <h2
            className="text-lg font-semibold tracking-tight sm:text-2xl"
            aria-live="polite"
            aria-atomic="true"
          >
            {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("calendar.timeZone")}</p>
        </div>
        {onBlockSlot && (
          <Button type="button" variant="outline" onClick={onBlockSlot} className="min-h-10">
            <LockKeyhole aria-hidden="true" />
            {t("adminCalendar.block.button")}
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border p-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t(`calendar.previous.${view}`)}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCurrentDate(toBerlinDate())
                setSelectedDate(null)
              }}
            >
              {t("calendar.today")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t(`calendar.next.${view}`)}
              onClick={() => navigate(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <label htmlFor={dateInputId} className="sr-only">
            {t("calendar.jumpToDate")}
          </label>
          <input
            id={dateInputId}
            type="date"
            value={format(currentDate, "yyyy-MM-dd")}
            className="min-h-11 min-w-0 max-w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => {
              try {
                setCurrentDate(toBerlinDate(parseBerlinDateTime(`${event.target.value}T00:00`)))
                setSelectedDate(null)
              } catch {
                // A cleared or incomplete native date input does not change the displayed day.
              }
            }}
          />
        </div>
        <div
          role="group"
          aria-label={t("calendar.viewLabel")}
          className="grid grid-cols-4 gap-1 rounded-lg bg-muted/70 p-1 lg:w-auto"
        >
          {(["agenda", "month", "week", "day"] as CalendarView[]).map((option) => (
            <Button
              key={option}
              type="button"
              variant="ghost"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={cn(
                "min-h-10 px-3 text-xs sm:text-sm",
                view === option && "bg-background shadow-sm hover:bg-background",
              )}
            >
              {t(`calendar.views.${option}`)}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {selectedDate
          ? `${t("calendar.selected")}: ${format(selectedDate, "PP HH:mm", options)}`
          : t("calendar.hint")}
      </p>
    </div>
  )
}
