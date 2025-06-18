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
import {
  addMinutes,
  differenceInMinutes,
  format,
  differenceInDays,
  startOfDay,
  endOfDay,
} from "date-fns"
import { useController, useWatch, type Control } from "react-hook-form"
import { trpc } from "@/utils/trpc"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/locales/i18n"
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

// Define a type for the intervals returned by tRPC for clarity
interface BookingInterval {
  id?: string
  startDate: Date
  endDate: Date
  status: "REQUESTED" | "ACCEPTED" | "BORROWED" | string // Adapt to your BookingStatus enum
  quantity: number
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>
  itemId: string
  dateRange: { from: Date; to?: Date }
  totalQuantity: number
}

/* ───────── constants ───────── */
const MIN_MINUTES = 8 * 60 // 8:00 AM
const MAX_MINUTES = 22 * 60 // 10:00 PM
const STEP_MINUTES = 15
const DEF_START_MINUTES = 14 * 60 // 2:00 PM
const DEF_LEN_MINUTES = 120 // 2 hours
const GUTTER_PERCENT = 5
const BLOCK_PENDING_INTERVALS = false
/* ───────────────────────────── */

export default function InteractiveTimeRangePicker({
  control,
  itemId,
  dateRange,
  totalQuantity,
}: Props) {
  const { t } = useI18n()
  const fromDate = dateRange.from
  const toDateProp = dateRange.to

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

  const { field: sField } = useController({ control, name: "startTime" })
  const { field: eField } = useController({ control, name: "endTime" })
  const watchS = useWatch({ control, name: "startTime" })
  const watchE = useWatch({ control, name: "endTime" })

  const m2s = React.useCallback(
    (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    [],
  )
  const s2m = React.useCallback((s: string) => {
    if (!s || !s.includes(":")) return MIN_MINUTES
    const [a, b] = s.split(":").map(Number)
    if (isNaN(a) || isNaN(b)) return MIN_MINUTES
    return a * 60 + b
  }, [])

  const checkOverlaps = React.useCallback(
    (list: BookingInterval[], a: number, b: number, dayOffsetMinutes: number) => {
      return list.some((iv) => {
        const intervalStartMinutesFromSelectionStart = differenceInMinutes(iv.startDate, fromDate)
        const intervalEndMinutesFromSelectionStart = differenceInMinutes(iv.endDate, fromDate)
        const s = intervalStartMinutesFromSelectionStart - dayOffsetMinutes
        const e = intervalEndMinutesFromSelectionStart - dayOffsetMinutes
        return e > MIN_MINUTES && s < MAX_MINUTES && a < e && b > s
      })
    },
    [fromDate],
  )

  const doesBlock = React.useCallback(
    (a: number, b: number, dayOffsetMinutes: number) => {
      return (
        checkOverlaps(confirmed, a, b, dayOffsetMinutes) ||
        (BLOCK_PENDING_INTERVALS && checkOverlaps(pending, a, b, dayOffsetMinutes))
      )
    },
    [checkOverlaps, confirmed, pending],
  )
  const initKey = `${fromDate.toDateString()}-${itemId}`
  React.useEffect(() => {
    if (intervalsLoading) return

    // Check if form already has valid time values - if so, don't override them
    const currentStartMinutes = s2m(watchS)
    const currentEndMinutes = s2m(watchE)
    const hasValidExistingTimes =
      watchS &&
      watchE &&
      currentStartMinutes >= MIN_MINUTES &&
      currentStartMinutes < MAX_MINUTES &&
      currentEndMinutes > MIN_MINUTES &&
      currentEndMinutes <= MAX_MINUTES &&
      currentEndMinutes > currentStartMinutes

    if (hasValidExistingTimes) {
      // Don't override existing valid times
      return
    }

    let st = DEF_START_MINUTES,
      en = st + DEF_LEN_MINUTES
    if (en > MAX_MINUTES) {
      st = MIN_MINUTES
      en = st + DEF_LEN_MINUTES
    }

    let attempts = 0
    const maxAttempts = (MAX_MINUTES - MIN_MINUTES) / STEP_MINUTES

    while (doesBlock(st, en, 0) && st < MAX_MINUTES - STEP_MINUTES && attempts < maxAttempts) {
      st += STEP_MINUTES
      en += STEP_MINUTES
      if (en > MAX_MINUTES) {
        en = Math.min(MAX_MINUTES, st + DEF_LEN_MINUTES)
        if (en <= st) {
          st = Math.min(MAX_MINUTES - STEP_MINUTES, st)
          en = st + STEP_MINUTES
        }
      }
      attempts++
    }

    if (doesBlock(st, en, 0) || en > MAX_MINUTES || st >= MAX_MINUTES) {
      st = MIN_MINUTES
      en = st + STEP_MINUTES
      attempts = 0
      while (doesBlock(st, en, 0) && st < MAX_MINUTES - STEP_MINUTES && attempts < maxAttempts) {
        st += STEP_MINUTES
        en += STEP_MINUTES
        attempts++
      }
      if (doesBlock(st, en, 0)) {
        st = MIN_MINUTES
        en = MIN_MINUTES + STEP_MINUTES
      }
    }

    // console.log(`[ITRP InitEffect] Setting default startTime: ${m2s(st)}, endTime: ${m2s(en)}`);
    sField.onChange(m2s(st))
    eField.onChange(m2s(en))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initKey,
    intervalsLoading,
    doesBlock,
    m2s,
    sField.onChange,
    eField.onChange,
    watchS,
    watchE,
    s2m,
  ]) // sField, eField are stable from useController

  const startM = s2m(watchS)
  const endM = s2m(watchE)

  const reservedForSelection = React.useMemo(() => {
    const selectionStart = addMinutes(fromDate, startM)
    const selectionEnd = addMinutes(isRangeSelection ? addMinutes(fromDate, 1440) : fromDate, endM)
    return intervals.reduce((sum, iv) => {
      if (
        (iv.status === "ACCEPTED" || iv.status === "BORROWED") &&
        iv.endDate > selectionStart &&
        iv.startDate < selectionEnd
      ) {
        return sum + (iv.quantity ?? 1)
      }
      return sum
    }, 0)
  }, [intervals, startM, endM, fromDate, isRangeSelection])
  const availableForSelection = Math.max(0, totalQuantity - reservedForSelection)
  const track0Ref = React.useRef<HTMLDivElement>(null)
  const track1Ref = React.useRef<HTMLDivElement>(null)
  const tracks = React.useMemo(() => [track0Ref, track1Ref], [])
  const [drag, setDrag] = React.useState<{ row: 0 | 1; which: "start" | "end" } | null>(null)

  const clampMinutes = React.useCallback((px: number, row: 0 | 1) => {
    const trackRef = row === 0 ? track0Ref : track1Ref
    if (!trackRef.current) return MIN_MINUTES
    const rect = trackRef.current!.getBoundingClientRect()
    const trackActualWidth = rect.width
    const clickPctInTrack = Math.min(1, Math.max(0, (px - rect.left) / trackActualWidth))
    return (
      Math.round((MIN_MINUTES + clickPctInTrack * (MAX_MINUTES - MIN_MINUTES)) / STEP_MINUTES) *
      STEP_MINUTES
    )
  }, [])

  React.useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!drag) return
      const v = clampMinutes(e.pageX, drag.row)
      const dayOffsetMinutes = drag.row === 1 ? 1440 : 0

      if (doesBlock(v, v, dayOffsetMinutes)) return

      if (drag.which === "start") {
        const limit = isRangeSelection && drag.row === 0 ? MAX_MINUTES : endM - STEP_MINUTES
        const newStart = Math.min(v, limit)
        if (newStart >= MIN_MINUTES) {
          sField.onChange(m2s(newStart))
        } else {
          sField.onChange(m2s(MIN_MINUTES))
        }
      } else if (drag.which === "end") {
        const limit = isRangeSelection && drag.row === 1 ? MIN_MINUTES : startM + STEP_MINUTES
        const newEnd = Math.max(v, limit)
        if (newEnd <= MAX_MINUTES) {
          eField.onChange(m2s(newEnd))
        } else {
          eField.onChange(m2s(MAX_MINUTES))
        }
      }
    }
    const handlePointerUp = () => setDrag(null)
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    drag,
    clampMinutes,
    doesBlock,
    m2s,
    startM,
    endM,
    isRangeSelection,
    sField.onChange,
    eField.onChange,
  ])

  const pct = React.useCallback((m: number) => {
    const percentage = ((m - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES)) * 100
    return Math.max(0, Math.min(100, percentage))
  }, [])

  const trackVisibleWidthScale = (100 - GUTTER_PERCENT) / 100

  const Thumb = React.useCallback(
    ({
      minutes,
      label,
      onDrag,
    }: {
      row: 0 | 1
      minutes: number
      label: string
      onDrag: () => void
    }) => (
      <Card
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onDrag()
        }}
        className="absolute -top-7 w-auto min-w-[6rem] px-3 rounded-2xl shadow-lg border bg-card cursor-grab z-20"
        style={{
          left: `calc(${GUTTER_PERCENT}% + ${pct(minutes) * trackVisibleWidthScale}%)`,
          transform: "translateX(-50%)",
        }}
      >
        <CardContent className="p-2 text-center text-base font-semibold">{label}</CardContent>
      </Card>
    ),
    [pct, trackVisibleWidthScale],
  )

  const Row = React.useCallback(
    (row: 0 | 1) => {
      const dayOffsetMinutes = row === 1 ? 1440 : 0
      const showStartThumb = row === 0
      const showEndThumb = row === (isRangeSelection ? 1 : 0)

      const rStartForThumb = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, startM))
      const rEndForThumb = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, endM))

      let hL_pct: number, hR_pct: number
      if (!isRangeSelection) {
        hL_pct = pct(startM)
        hR_pct = pct(endM)
      } else if (row === 0) {
        hL_pct = pct(startM)
        hR_pct = pct(MAX_MINUTES)
      } else {
        hL_pct = pct(MIN_MINUTES)
        hR_pct = pct(endM)
      }

      if (hL_pct > hR_pct && !isRangeSelection) {
        hL_pct = hR_pct
      }

      const highlightLeftStyle = `${GUTTER_PERCENT + hL_pct * trackVisibleWidthScale}%`
      const highlightWidthStyle = `${Math.max(0, hR_pct - hL_pct) * trackVisibleWidthScale}%`

      const currentRowDate = addMinutes(fromDate, dayOffsetMinutes)

      return (
        <div key={row} className="relative h-24 select-none">
          {isRangeSelection && (
            <span className="absolute -left-14 top-[46px] px-2 py-0.5 rounded bg-muted text-[10px]">
              {row === 0 ? "Day 1" : "Day 2"}
            </span>
          )}
          <div
            ref={tracks[row]}
            className="absolute top-11 h-4 bg-muted rounded-lg"
            style={{ left: `${GUTTER_PERCENT}%`, right: "0px" }}
          />
          <div
            className="absolute top-11 h-4 bg-primary/30 rounded z-0"
            style={{ left: highlightLeftStyle, width: highlightWidthStyle }}
          />
          {intervals.map((iv, i) => {
            const intervalStartMinutesFromSelectionStart = differenceInMinutes(
              iv.startDate,
              fromDate,
            )
            const intervalEndMinutesFromSelectionStart = differenceInMinutes(iv.endDate, fromDate)
            const s_relativeToRowDay = intervalStartMinutesFromSelectionStart - dayOffsetMinutes
            const e_relativeToRowDay = intervalEndMinutesFromSelectionStart - dayOffsetMinutes

            if (e_relativeToRowDay <= MIN_MINUTES || s_relativeToRowDay >= MAX_MINUTES) {
              return null
            }

            const l_clamped = Math.max(s_relativeToRowDay, MIN_MINUTES)
            const r_clamped = Math.min(e_relativeToRowDay, MAX_MINUTES)

            const interval_pct_l = pct(l_clamped)
            const interval_pct_r = pct(r_clamped)

            const minStepPct = pct(MIN_MINUTES + STEP_MINUTES) - pct(MIN_MINUTES)
            const w_pct = Math.max(minStepPct / 3, interval_pct_r - interval_pct_l)

            if (w_pct <= 0) return null

            const isConf = iv.status === "ACCEPTED"

            const formatIntervalDates = (startDate: Date, endDate: Date) => {
              const pickerIsSingleDayAndIntervalIsOnSameDay =
                !isRangeSelection &&
                differenceInDays(startDate, fromDate) === 0 &&
                differenceInDays(endDate, fromDate) === 0
              const startFmt = pickerIsSingleDayAndIntervalIsOnSameDay ? "p" : "PP p"
              const endFmt =
                pickerIsSingleDayAndIntervalIsOnSameDay ||
                differenceInDays(endDate, startDate) === 0
                  ? "p"
                  : "PP p"
              return `${format(startDate, startFmt)} – ${format(endDate, endFmt)}`
            }

            return (
              <Tooltip key={`${iv.id || `interval-${i}`}-${row}`}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute top-11 h-4 rounded z-10 ${isConf ? "bg-rose-500/80" : "bg-amber-300/70"}`}
                    style={{
                      left: `calc(${GUTTER_PERCENT}% + ${interval_pct_l * trackVisibleWidthScale}%)`,
                      width: `${w_pct * trackVisibleWidthScale}%`,
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  sideOffset={8}
                  className="max-w-xs p-2 text-sm leading-tight"
                >
                  {isConf
                    ? "Booked"
                    : iv.status === "REQUESTED"
                      ? "Pending"
                      : `Status: ${iv.status}`}
                  <br />
                  {formatIntervalDates(iv.startDate, iv.endDate)}
                </TooltipContent>
              </Tooltip>
            )
          })}
          {showStartThumb && (
            <Thumb
              row={row}
              minutes={rStartForThumb}
              label={format(addMinutes(currentRowDate, rStartForThumb), "HH:mm")}
              onDrag={() => setDrag({ row, which: "start" })}
            />
          )}
          {showEndThumb && (
            <Thumb
              row={row}
              minutes={rEndForThumb}
              label={format(addMinutes(currentRowDate, rEndForThumb), "HH:mm")}
              onDrag={() => setDrag({ row, which: "end" })}
            />
          )}
        </div>
      )
    },
    [
      intervals,
      fromDate,
      isRangeSelection,
      startM,
      endM,
      pct,
      trackVisibleWidthScale,
      tracks,
      Thumb,
    ],
  ) // Added missing date-fns functions

  if (intervalsLoading && !intervals.length) {
    return (
      <div className="h-48 flex items-center justify-center bg-muted rounded text-sm text-muted-foreground">
        Loading availability...
      </div>
    )
  }
  if (intervalsError) {
    return (
      <div className="h-48 flex items-center justify-center bg-destructive/10 text-destructive rounded text-sm p-4">
        Error loading availability. Please try again.
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      {Row(0)}
      {isRangeSelection && Row(1)}
      <div className="flex justify-end gap-6 mt-6 text-xs select-none">
        <Chip color="bg-rose-500/80" label="Booked" />
        <Chip color="bg-amber-300/70" label="Pending" />
      </div>
      {totalQuantity > 1 && (
        <p className="text-right text-xs mt-2">
          {t("bookingForm.availabilityLine", {
            available: availableForSelection,
            total: totalQuantity,
          })}
        </p>
      )}
    </TooltipProvider>
  )
}

const Chip = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1">
    <span className={`inline-block w-3 h-2 rounded ${color}`} /> {label}
  </div>
)
