"use client"

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import type { CalendarBooking } from "./types"
import { toBerlinDate } from "@/lib/berlin-time"

export type CalendarView = "month" | "week" | "day" | "agenda"

const compactQuery = "(max-width: 639px)"
function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(compactQuery)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
const isCompact = () => window.matchMedia(compactQuery).matches
const serverCompact = () => false
const subscribeToNothing = () => () => {}

interface CalendarContextType {
  currentDate: Date
  setCurrentDate: (date: Date) => void
  view: CalendarView
  setView: (view: CalendarView) => void
  selectedDate: Date | null
  setSelectedDate: (date: Date | null) => void
  selectedBooking: CalendarBooking | null
  setSelectedBooking: (b: CalendarBooking | null) => void
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined)

export function CalendarProvider({
  children,
  responsive = true,
}: {
  children: ReactNode
  responsive?: boolean
}) {
  const [currentDate, setCurrentDateState] = useState(() => toBerlinDate())
  const setCurrentDate = useCallback((date: Date) => setCurrentDateState(toBerlinDate(date)), [])
  const [chosenView, setView] = useState<CalendarView | null>(null)
  const compact = useSyncExternalStore(
    responsive ? subscribeToViewport : subscribeToNothing,
    responsive ? isCompact : serverCompact,
    serverCompact,
  )
  const view = chosenView ?? (compact ? "agenda" : "week")
  const [selectedDate, setSelectedDateState] = useState<Date | null>(null)
  const setSelectedDate = useCallback(
    (date: Date | null) => setSelectedDateState(date ? toBerlinDate(date) : null),
    [],
  )
  const [selectedBooking, setSelectedBooking] = useState<CalendarBooking | null>(null)

  return (
    <CalendarContext.Provider
      value={{
        currentDate,
        setCurrentDate,
        view,
        setView,
        selectedDate,
        setSelectedDate,
        selectedBooking,
        setSelectedBooking,
      }}
    >
      {children}
    </CalendarContext.Provider>
  )
}

export function useCalendar() {
  const context = useContext(CalendarContext)
  if (context === undefined) {
    throw new Error("useCalendar must be used within a CalendarProvider")
  }
  return context
}
