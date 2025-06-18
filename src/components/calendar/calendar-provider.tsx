"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import type { CalendarBooking } from "./types"

export type CalendarView = "month" | "week" | "day"

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

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<CalendarView>("week")
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
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
