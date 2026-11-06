"use client"

import { useCurrentAccount } from "@/features/identity/client"
import { useEffect, useState, useRef, useMemo } from "react"
import { isPast } from "date-fns"
import { combineBerlinDateAndTime, formatInBerlin as format } from "@/lib/berlin-time"
import { trpc } from "@/utils/trpc"
import { toast } from "@/components/ui/use-toast"
import { useI18n } from "@/locales/i18n"
import { type DateRange } from "react-day-picker"
import { BookingStatus } from "@prisma/client"
import type { BookingFromList, MyBookingsFeatureProps } from "./types"
import {
  FINISHED_BOOKING_STATUSES,
  isSameDay,
  differenceInCalendarDays,
  ensureDateObject,
} from "./booking-policy"

export function useMyBookings({
  highlightBookingId,
  onGoBackToList,
}: Pick<MyBookingsFeatureProps, "highlightBookingId" | "onGoBackToList">) {
  const { status: sessionStatus } = useCurrentAccount()
  const { t } = useI18n()

  const [filters, setFilters] = useState<{
    highlightId: string | null | undefined
    time: "upcoming" | "past"
    status: BookingStatus | "all"
  } | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<BookingFromList | null>(null)

  const [showDetails, setShowDetails] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  const [editDateRange, setEditDateRange] = useState<DateRange | undefined>(undefined)
  const [editStartTime, setEditStartTime] = useState("")
  const [editEndTime, setEditEndTime] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editError, setEditError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const highlightedBookingRef = useRef<HTMLDivElement>(null)
  const activeHighlightId = highlightBookingId

  const {
    data: userBookingsData,
    isLoading,
    error: fetchBookingsError,
    refetch,
  } = trpc.bookings.list.useQuery(
    { all: false },
    {
      enabled: sessionStatus === "authenticated",
    },
  )

  const allBookings: BookingFromList[] = useMemo(
    () => (userBookingsData || []) as BookingFromList[],
    [userBookingsData],
  )
  const highlighted = allBookings.find((booking) => booking.id === activeHighlightId)
  const highlightIsPast = highlighted && (
    FINISHED_BOOKING_STATUSES.includes(highlighted.status) || isPast(ensureDateObject(highlighted.endDate))
  )
  const currentFilters = filters?.highlightId === activeHighlightId ? filters : null
  const timeFilter = currentFilters?.time ?? (highlightIsPast ? "past" : "upcoming")
  const activeTab = currentFilters?.status ?? "all"
  const setTimeFilter = (time: "upcoming" | "past") => {
    setFilters({ highlightId: activeHighlightId, time, status: "all" })
  }
  const setActiveTab = (status: BookingStatus | "all") => {
    setFilters({ highlightId: activeHighlightId, time: timeFilter, status })
  }

  useEffect(() => {
    if (fetchBookingsError) {
      toast({
        title: t("errors.title"),
        description: fetchBookingsError.message || t("errors.fetchBookings"),
        variant: "destructive",
      })
    }
  }, [fetchBookingsError, t])

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      onGoBackToList()
    }
  }, [sessionStatus, onGoBackToList])

  useEffect(() => {
    if (
      activeHighlightId &&
      highlightedBookingRef.current &&
      !isLoading &&
      allBookings.length > 0
    ) {
      const element = highlightedBookingRef.current
      if (element) {
        let clearHighlightTimer: ReturnType<typeof setTimeout> | undefined
        const scrollTimer = setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
          element.classList.add("animate-pulse-bg")
          clearHighlightTimer = setTimeout(() => element.classList.remove("animate-pulse-bg"), 2500)
        }, 100)
        return () => {
          clearTimeout(scrollTimer)
          clearTimeout(clearHighlightTimer)
          element.classList.remove("animate-pulse-bg")
        }
      }
    }
  }, [activeHighlightId, allBookings, isLoading, timeFilter, activeTab])

  const combineDateTime = (d: Date | undefined, timeStr: string): Date => {
    if (!d) throw new Error(t("errors.selectDate"))
    return combineBerlinDateAndTime(d, timeStr)
  }

  const bookingsByTime = useMemo(() => {
    const upcoming: BookingFromList[] = []
    const past: BookingFromList[] = []

    for (const booking of allBookings) {
      const isFinishedStatus = FINISHED_BOOKING_STATUSES.includes(booking.status)
      const endsInPast = isPast(ensureDateObject(booking.endDate))

      if (isFinishedStatus || endsInPast) {
        past.push(booking)
      } else {
        upcoming.push(booking)
      }
    }

    return { upcoming, past }
  }, [allBookings])

  const timeFilteredBookings = useMemo(
    () => (timeFilter === "past" ? bookingsByTime.past : bookingsByTime.upcoming),
    [bookingsByTime, timeFilter],
  )

  const prepareEditForm = (booking: BookingFromList) => {
    try {
      const sd = ensureDateObject(booking.startDate)
      const ed = ensureDateObject(booking.endDate)

      setEditDateRange({ from: sd, to: !isSameDay(sd, ed) ? ed : undefined })
      setEditStartTime(format(sd, "HH:mm"))
      setEditEndTime(format(ed, "HH:mm"))
      setEditNotes(booking.notes ?? "")
      setEditError("")
      setSelectedBooking(booking)
      setShowEditDialog(true)
    } catch (e) {
      console.error("Error preparing edit form:", e)
      toast({
        title: t("common.error"),
        description: t("myBookings.errorPrepareEdit", {
          defaultValue: "Could not prepare edit form.",
        }),
        variant: "destructive",
      })
    }
  }

  const validateEditForm = (): boolean => {
    setEditError("")
    if (!editDateRange?.from) {
      setEditError(t("errors.selectDate"))
      return false
    }
    if (!editStartTime) {
      setEditError(t("errors.startTimeRequired"))
      return false
    }
    if (!editEndTime) {
      setEditError(t("errors.endTimeRequired"))
      return false
    }
    try {
      const s = combineDateTime(editDateRange.from, editStartTime)
      const effEndDay = editDateRange.to || editDateRange.from
      const e = combineDateTime(effEndDay, editEndTime)

      if (e <= s) {
        setEditError(t("errors.endTimeNotAfterStart"))
        return false
      }
      if (isPast(s)) {
        setEditError(t("errors.pastTime"))
        return false
      }
      if (differenceInCalendarDays(effEndDay, editDateRange.from) > 1) {
        setEditError(t("errors.maxBookingDuration", { hours: 48 }))
        return false
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setEditError(msg || t("errors.invalidDateTime"))
      return false
    }
    return true
  }

  const updateBookingMutation = trpc.bookings.update.useMutation({
    onSuccess: (data) => {
      refetch()
      setShowEditDialog(false)
      toast({
        title: t("myBookings.editSuccessTitle"),
        description:
          data.status === BookingStatus.REQUESTED
            ? t("myBookings.editSuccessReRequestedDesc", {
                defaultValue: "Booking updated and re-submitted for approval.",
              })
            : t("myBookings.editSuccessDescription"),
      })
    },
    onError: (error) => setEditError(error.message || t("myBookings.editErrorDefault")),
    onSettled: () => setIsSubmitting(false),
  })

  const cancelBookingMutation = trpc.bookings.cancel.useMutation({
    onSuccess: () => {
      refetch()
      setShowCancelDialog(false)
      toast({
        title: t("myBookings.cancelSuccessTitle"),
        description: t("myBookings.cancelSuccessDescription"),
      })
    },
    onError: (err) => {
      toast({
        title: t("errors.title"),
        description: err.message || t("errors.unexpected"),
        variant: "destructive",
      })
    },
  })

  const handleUpdateBooking = async () => {
    if (!selectedBooking || !validateEditForm()) return
    setIsSubmitting(true)
    try {
      const startDateTime = combineDateTime(editDateRange!.from, editStartTime)
      const effEndDay = editDateRange!.to || editDateRange!.from
      const endDateTime = combineDateTime(effEndDay, editEndTime)
      updateBookingMutation.mutate({
        id: selectedBooking.id,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        notes: editNotes.trim() || undefined,
      })
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : t("myBookings.editErrorInvalidDateTime"),
      )
      setIsSubmitting(false)
    }
  }

  const filteredBookingsToDisplay = useMemo(
    () =>
      activeTab === "all"
        ? timeFilteredBookings
        : timeFilteredBookings.filter((b) => b.status === activeTab),
    [activeTab, timeFilteredBookings],
  )

  return {
    sessionStatus,
    isLoading,
    activeTab,
    setActiveTab,
    timeFilter,
    setTimeFilter,
    selectedBooking,
    setSelectedBooking,
    showDetails,
    setShowDetails,
    showEditDialog,
    setShowEditDialog,
    showCancelDialog,
    setShowCancelDialog,
    editDateRange,
    setEditDateRange,
    editStartTime,
    setEditStartTime,
    editEndTime,
    setEditEndTime,
    editNotes,
    setEditNotes,
    editError,
    isSubmitting,
    highlightedBookingRef,
    activeHighlightId,
    filteredBookingsToDisplay,
    prepareEditForm,
    handleUpdateBooking,
    cancelBookingMutation,
  }
}
export type MyBookingsController = ReturnType<typeof useMyBookings>
