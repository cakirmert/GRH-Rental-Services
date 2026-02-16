// ──────────────────────────────────────────────────────────────
// src/components/ui/calendar.tsx
// ──────────────────────────────────────────────────────────────
"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, useNavigation, MonthCaptionProps, ClassNames } from "react-day-picker"
import { format } from "date-fns"
import type { Locale } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/* break-points for responsive layout */
const BP = { sm: 420, md: 720 } as const

export function Calendar({
  className,
  showOutsideDays = true,
  numberOfMonths: numProp,
  classNames: userCls,
  ...props
}: CalendarProps) {
  /* responsive number-of-months */
  const host = React.useRef<HTMLDivElement>(null)
  const [months, setMonths] = React.useState(numProp ?? 1)

  React.useEffect(() => {
    const el = host.current
    if (!el) return
    const resolve = (w: number) => (w < BP.sm ? 1 : w < BP.md ? 1 : 2)
    const update = (w: number) => setMonths(numProp ?? resolve(w))

    update(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([e]) => update(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [numProp])

  /* ---------- class-names ------------------------------ */
  const cls: Partial<ClassNames> = {
    day: cn(
      "relative text-center p-0",
      "h-10 w-10 text-sm",
      "md:h-12 md:w-12 md:text-base",
      "lg:h-14 lg:w-14 lg:text-lg",
    ),
    day_button: cn(
      "h-full w-full rounded-md font-normal select-none transition-colors cursor-pointer",
    ),
    selected:
      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
    range_start: "rounded-l-md",
    range_end: "rounded-r-md",
    range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
    outside:
      "text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
    disabled: "text-muted-foreground opacity-50",

    /* weekday header */
    weekdays: "flex w-full mt-1",
    weekday: cn(
      "text-muted-foreground font-normal flex-1 text-center",
      "text-sm md:text-base lg:text-lg",
    ),

    /* weeks & month grid */
    week: "flex w-full",
    month_grid: "w-full border-collapse",
    months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",

    /* nav bar hidden (we roll our own) */
    nav: "hidden",

    ...userCls,
  }

  /* ---------- custom caption (nav inside) -------------- */
  function Caption({ calendarMonth }: MonthCaptionProps) {
    const { previousMonth, nextMonth, goToMonth } = useNavigation()
    return (
      <div className="flex items-center justify-between h-10 px-2 mb-4">
        <button
          aria-label="Previous month"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-10 w-10 p-0 opacity-90 hover:opacity-100 md:h-12 md:w-12 lg:h-14 lg:w-14",
          )}
          onClick={() => previousMonth && goToMonth(previousMonth)}
          disabled={!previousMonth}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <span
          aria-live="polite"
          className="flex-1 text-center pointer-events-none select-none font-medium"
        >
          {format(calendarMonth.date, "LLLL yyyy", {
            locale: props.locale as Locale | undefined,
          })}
        </span>

        <button
          aria-label="Next month"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-10 w-10 p-0 opacity-90 hover:opacity-100 md:h-12 md:w-12 lg:h-14 lg:w-14",
          )}
          onClick={() => nextMonth && goToMonth(nextMonth)}
          disabled={!nextMonth}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    )
  }

  /* ---------- render ----------------------------------- */
  return (
    <div ref={host} className={cn("p-3 rounded-md border bg-background/50 glass inline-block", className)}>
      <DayPicker
        key={months} /* force full remount when layout changes   */
        {...props}
        showOutsideDays={showOutsideDays}
        numberOfMonths={months}
        classNames={cls}
        components={{ MonthCaption: Caption }}
      />
    </div>
  )
}
Calendar.displayName = "Calendar"
