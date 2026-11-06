"use client"

// src/components/InteractiveTimeRangePicker.tsx
// -----------------------------------------------------------------------------
// Interactive time range picker with visual feedback for bookings.
// - Fetches availability for a given item and date range.
// - Displays confirmed and pending bookings on a timeline.
// - Allows users to drag handles to select a start and end time.
// - Integrates with React Hook Form.
// - Dynamically adjusts for single-day or multi-day range selections.
// -----------------------------------------------------------------------------

import * as React from "react"
import { differenceInDays, startOfDay, endOfDay } from "date-fns"
import { de, enUS } from "date-fns/locale"
import * as SliderPrimitive from "@radix-ui/react-slider"
import {
  useController,
  useWatch,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { bookingAvailabilityCopy } from "@/locales/booking-availability"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  atLocalMinutes,
  localMinutesFromDay,
  peakReservedQuantity,
  availableTimeDefaults,
} from "@/utils/bookingAvailability"
import { formatInBerlin as format, toBerlinDate } from "@/lib/berlin-time"

interface TimeRangeFieldValues extends FieldValues {
  startTime: string
  endTime: string
}

interface Props<TFieldValues extends TimeRangeFieldValues> {
  control: Control<TFieldValues>
  itemId: string
  dateRange: { from: Date; to?: Date }
  totalQuantity: number
  onAvailabilityConflict?: (conflict: boolean) => void
}

/* ───────── constants ───────── */
const MINUTES_PER_HOUR = 60
const PERCENTAGE_BASE = 100
const TOOLTIP_DELAY = 200
const TOOLTIP_SIDE_OFFSET = 8
const MIN_VISUAL_STEP_DIVISOR = 3

const DAY_START_HOUR = 8 // 8:00 AM
const DAY_END_HOUR = 22 // 10:00 PM
const DEFAULT_START_HOUR = 14 // 2:00 PM
const DEFAULT_DURATION_MINUTES = 120 // 2 hours

const MIN_MINUTES = DAY_START_HOUR * MINUTES_PER_HOUR
const MAX_MINUTES = DAY_END_HOUR * MINUTES_PER_HOUR
const STEP_MINUTES = 15
const DEF_START_MINUTES = DEFAULT_START_HOUR * MINUTES_PER_HOUR
const DEF_LEN_MINUTES = DEFAULT_DURATION_MINUTES
const BLOCK_PENDING_INTERVALS = false
/* ───────────────────────────── */

export default function InteractiveTimeRangePicker<TFieldValues extends TimeRangeFieldValues>({
  control,
  itemId,
  dateRange,
  totalQuantity,
  onAvailabilityConflict,
}: Props<TFieldValues>) {
  const { t, locale } = useI18n()
  const copy = bookingAvailabilityCopy[locale === "de" ? "de" : "en"]
  const dateLocale = locale === "de" ? de : enUS
  const fromDate = React.useMemo(() => toBerlinDate(dateRange.from), [dateRange.from])
  const toDateProp = React.useMemo(
    () => (dateRange.to ? toBerlinDate(dateRange.to) : undefined),
    [dateRange.to],
  )

  const queryEndDate = toDateProp ? endOfDay(toDateProp) : endOfDay(fromDate)
  const queryStartDate = startOfDay(fromDate)

  const isRangeSelection = !!toDateProp && differenceInDays(toDateProp, fromDate) > 0

  const {
    data: intervals = [],
    isLoading: intervalsLoading,
    error: intervalsError,
  } = trpc.bookings.availability.useQuery(
    {
      itemId,
      from: queryStartDate.toISOString(),
      to: queryEndDate.toISOString(),
    },
    {
      enabled: !!itemId && !!fromDate,
    },
  )

  const confirmed = React.useMemo(
    () => intervals.filter((i) => i.status === "ACCEPTED" || i.status === "BORROWED"),
    [intervals],
  )
  const pending = React.useMemo(
    () => intervals.filter((i) => i.status === "REQUESTED"),
    [intervals],
  )

  const startTimeName = "startTime" as FieldPath<TFieldValues>
  const endTimeName = "endTime" as FieldPath<TFieldValues>
  const {
    field: { onChange: changeStart, onBlur: blurStart },
  } = useController({ control, name: startTimeName })
  const {
    field: { onChange: changeEnd, onBlur: blurEnd },
  } = useController({ control, name: endTimeName })
  const watchS = useWatch({ control, name: startTimeName }) as string
  const watchE = useWatch({ control, name: endTimeName }) as string

  const m2s = React.useCallback(
    (m: number) =>
      `${String(Math.floor(m / MINUTES_PER_HOUR)).padStart(2, "0")}:${String(
        m % MINUTES_PER_HOUR,
      ).padStart(2, "0")}`,
    [],
  )
  const s2m = React.useCallback((s: string) => {
    if (!s || !s.includes(":")) return MIN_MINUTES
    const [a, b] = s.split(":").map(Number)
    if (isNaN(a) || isNaN(b)) return MIN_MINUTES
    return a * MINUTES_PER_HOUR + b
  }, [])

  const occupied = React.useMemo(
    () => (BLOCK_PENDING_INTERVALS ? [...confirmed, ...pending] : confirmed),
    [confirmed, pending],
  )
  const endpointBlocked = React.useCallback(
    (minutes: number, row: 0 | 1, which: "start" | "end") => {
      const point = atLocalMinutes(row === 1 ? (toDateProp ?? fromDate) : fromDate, minutes)
      // The end is exclusive: returning at another booking's start is allowed.
      const start = which === "start" ? point : new Date(point.getTime() - 1)
      const end = which === "start" ? new Date(point.getTime() + 1) : point
      return peakReservedQuantity(occupied, start, end) >= totalQuantity
    },
    [fromDate, toDateProp, occupied, totalQuantity],
  )
  const initializedRange = React.useRef<string | null>(null)
  const initKey = `${itemId}:${fromDate.getTime()}:${toDateProp?.getTime() ?? fromDate.getTime()}:${totalQuantity}`

  React.useEffect(() => {
    if (intervalsLoading || intervalsError) return
    const currentStart = s2m(watchS)
    const currentEnd = s2m(watchE)
    const validStart = !!watchS && currentStart >= MIN_MINUTES && currentStart < MAX_MINUTES
    const validEnd =
      !!watchE &&
      currentEnd >= MIN_MINUTES &&
      currentEnd <= MAX_MINUTES &&
      (isRangeSelection || currentEnd > currentStart)
    // Preserve subsequent explicit time edits. Reconsider defaults when either date changes.
    if (initializedRange.current === initKey && validStart && validEnd) return
    initializedRange.current = initKey
    const next = availableTimeDefaults(occupied, {
      from: fromDate,
      to: toDateProp,
      totalQuantity,
      preferredStart: validStart ? currentStart : DEF_START_MINUTES,
      preferredEnd: validEnd ? currentEnd : DEF_START_MINUTES + DEF_LEN_MINUTES,
      min: MIN_MINUTES,
      max: MAX_MINUTES,
      step: STEP_MINUTES,
    })
    const start = next.start === null ? "" : m2s(next.start)
    const end = next.end === null ? "" : m2s(next.end)
    if (watchS !== start) changeStart(start)
    if (watchE !== end) changeEnd(end)
  }, [
    initKey,
    intervalsLoading,
    intervalsError,
    occupied,
    fromDate,
    toDateProp,
    totalQuantity,
    watchS,
    watchE,
    s2m,
    m2s,
    isRangeSelection,
    changeStart,
    changeEnd,
  ])
  const startM = s2m(watchS)
  const endM = s2m(watchE)
  const hasClockTimes = !!watchS && !!watchE

  const reservedForSelection = React.useMemo(() => {
    const selectionStart = atLocalMinutes(fromDate, startM)
    const selectionEnd = atLocalMinutes(toDateProp ?? fromDate, endM)
    return peakReservedQuantity(confirmed, selectionStart, selectionEnd)
  }, [confirmed, startM, endM, fromDate, toDateProp])
  const availableForSelection = Math.max(0, totalQuantity - reservedForSelection)
  const availabilityConflict =
    !intervalsLoading && !intervalsError && (!hasClockTimes || availableForSelection === 0)
  React.useEffect(() => {
    onAvailabilityConflict?.(availabilityConflict)
    return () => onAvailabilityConflict?.(false)
  }, [availabilityConflict, onAvailabilityConflict])
  const pct = (minutes: number) =>
    Math.max(
      0,
      Math.min(
        PERCENTAGE_BASE,
        ((minutes - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES)) * PERCENTAGE_BASE,
      ),
    )

  function updateTimes(row: 0 | 1, values: number[]) {
    if (isRangeSelection) {
      const minutes = row === 0 ? Math.min(values[0], MAX_MINUTES - STEP_MINUTES) : values[0]
      if (endpointBlocked(minutes, row, row === 0 ? "start" : "end")) return
      if (row === 0) changeStart(m2s(minutes))
      else changeEnd(m2s(minutes))
      return
    }
    const [nextStart, nextEnd] = values
    if (nextStart !== startM && endpointBlocked(nextStart, 0, "start")) return
    if (nextEnd !== endM && endpointBlocked(nextEnd, 0, "end")) return
    if (nextStart !== startM) changeStart(m2s(nextStart))
    if (nextEnd !== endM) changeEnd(m2s(nextEnd))
  }

  function Row(row: 0 | 1) {
    const currentRowDate = row === 1 ? (toDateProp ?? fromDate) : fromDate
    const start = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, startM))
    const end = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, endM))
    const left = isRangeSelection && row === 1 ? 0 : pct(start)
    const right = isRangeSelection && row === 0 ? 100 : pct(end)
    const dateLabel = format(currentRowDate, "dd MMM", { locale: dateLocale })
    const values = !hasClockTimes ? [] : isRangeSelection ? [row === 0 ? start : end] : [start, end]

    return (
      <div key={row} className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-muted-foreground">
              {format(currentRowDate, "EEE", { locale: dateLocale })}
            </span>
            <time dateTime={format(currentRowDate, "yyyy-MM-dd")}>{dateLabel}</time>
          </div>
          <span className="font-medium tabular-nums">
            {!hasClockTimes
              ? copy.unavailable
              : isRangeSelection
                ? `${row === 0 ? copy.start : copy.end} · ${m2s(row === 0 ? start : end)}`
                : `${m2s(start)} – ${m2s(end)}`}
          </span>
        </div>
        <div className="px-2.5">
          <SliderPrimitive.Root
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            step={STEP_MINUTES}
            disabled={!hasClockTimes}
            minStepsBetweenThumbs={1}
            value={values}
            onValueChange={(next) => updateTimes(row, next)}
            onValueCommit={() => {
              blurStart()
              blurEnd()
            }}
            className="relative flex h-11 w-full touch-none select-none items-center"
          >
            <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-muted">
              {hasClockTimes && (
                <span
                  aria-hidden="true"
                  className="absolute h-full bg-primary/35"
                  style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
                />
              )}
              {intervals.map((interval, index) => {
                const startMinutes = localMinutesFromDay(interval.startDate, currentRowDate)
                const endMinutes = localMinutesFromDay(interval.endDate, currentRowDate)
                if (endMinutes <= MIN_MINUTES || startMinutes >= MAX_MINUTES) return null
                const intervalLeft = pct(Math.max(MIN_MINUTES, startMinutes))
                const intervalRight = pct(Math.min(MAX_MINUTES, endMinutes))
                const width = Math.min(
                  100 - intervalLeft,
                  Math.max(
                    pct(MIN_MINUTES + STEP_MINUTES) / MIN_VISUAL_STEP_DIVISOR,
                    intervalRight - intervalLeft,
                  ),
                )
                const booked = interval.status === "ACCEPTED" || interval.status === "BORROWED"
                const label = booked ? copy.booked : copy.pending
                const dates = `${format(interval.startDate, "dd MMM, HH:mm", { locale: dateLocale })} – ${format(interval.endDate, "dd MMM, HH:mm", { locale: dateLocale })}`
                return (
                  <Tooltip key={`${interval.id || index}-${row}`}>
                    <TooltipTrigger asChild>
                      <span
                        role="img"
                        tabIndex={0}
                        aria-label={`${label}: ${dates}`}
                        className={`absolute z-10 h-full rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${booked ? "bg-rose-500" : "bg-amber-400"}`}
                        style={{ left: `${intervalLeft}%`, width: `${width}%` }}
                      />
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={TOOLTIP_SIDE_OFFSET}
                      className="max-w-xs text-xs"
                    >
                      <p className="font-medium">{label}</p>
                      <p>{dates}</p>
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </SliderPrimitive.Track>
            {values.map((value, index) => {
              const label = isRangeSelection
                ? row === 0
                  ? copy.start
                  : copy.end
                : index === 0
                  ? copy.start
                  : copy.end
              return (
                <SliderPrimitive.Thumb
                  key={label}
                  aria-label={`${label} · ${dateLabel}`}
                  aria-valuetext={m2s(value)}
                  aria-valuemax={
                    isRangeSelection && row === 0 ? MAX_MINUTES - STEP_MINUTES : undefined
                  }
                  className="relative z-20 block size-5 cursor-grab rounded-full border-2 border-primary bg-background shadow-sm after:absolute after:-inset-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing"
                />
              )
            })}
          </SliderPrimitive.Root>
          <div
            aria-hidden="true"
            className="flex justify-between text-[10px] tabular-nums text-muted-foreground"
          >
            <span>08:00</span>
            <span>15:00</span>
            <span>22:00</span>
          </div>
        </div>
      </div>
    )
  }
  if (intervalsLoading && !intervals.length) {
    return (
      <div
        role="status"
        className="flex min-h-28 items-center justify-center rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground"
      >
        {copy.loading}
      </div>
    )
  }
  if (intervalsError) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-rose-700 dark:text-rose-300"
      >
        {copy.error}
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={TOOLTIP_DELAY}>
      <section
        aria-label={copy.title}
        className="min-w-0 space-y-4 rounded-lg border bg-muted/20 p-3 sm:p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{copy.title}</h3>
          <span className="text-xs text-muted-foreground">{copy.timeZone}</span>
        </div>
        {Row(0)}
        {isRangeSelection && (
          <>
            <p className="text-center text-[11px] text-muted-foreground">{copy.continues}</p>
            {Row(1)}
          </>
        )}
        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px]">
            <Chip color="bg-primary/35" label={copy.selection} />
            <Chip color="bg-rose-500" label={copy.booked} />
            <Chip color="bg-amber-400" label={copy.pending} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{copy.hint}</p>
          {!hasClockTimes ? (
            <p role="status" className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
              {copy.noTimes}
            </p>
          ) : (
            availableForSelection === 0 && (
              <p role="status" className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
                {copy.conflict}
              </p>
            )
          )}
          {hasClockTimes && totalQuantity > 1 && (
            <p className="text-xs font-medium">
              {t("bookingForm.availabilityLine", {
                available: availableForSelection,
                total: totalQuantity,
              })}
            </p>
          )}
        </div>
      </section>
    </TooltipProvider>
  )
}

const Chip = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span aria-hidden="true" className={`inline-block size-2 rounded-full ${color}`} /> {label}
  </span>
)
