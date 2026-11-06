"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { useI18n } from "@/locales/i18n"
import { trpc } from "@/utils/trpc"
import { type BookingForRentalTeam } from "@/types/booking"
import { BookingStatus } from "@prisma/client"
import { toast } from "@/components/ui/use-toast"
import { useDebounce } from "@/hooks/useDebounce"
import { splitNoteEntries } from "./booking-notes"
import type { StaffDashboardProps, StaffView } from "./types"

export function useStaffBookings({
  view,
  onViewChange,
}: Pick<StaffDashboardProps, "view" | "onViewChange">) {
  const { t } = useI18n()
  const trpcUtils = trpc.useUtils()
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const [searchTermInput, setSearchTermInput] = useState("")
  const debouncedSearchTerm = useDebounce(searchTermInput, 300)
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "ALL_ACTIVE">("ALL_ACTIVE")

  const [showActionModal, setShowActionModalState] = useState(false)
  const [selectedBookingForAction, setSelectedBookingForAction] =
    useState<BookingForRentalTeam | null>(null)
  const [actionToConfirm, setActionToConfirm] = useState<BookingStatus | null>(null)
  const [localView, setLocalView] = useState<StaffView>("list")
  const viewMode = view ?? localView
  const setViewMode = (next: StaffView) => {
    if (onViewChange) onViewChange(next)
    else setLocalView(next)
  }
  const [noteDialogBooking, setNoteDialogBooking] = useState<BookingForRentalTeam | null>(null)
  const [noteEditorValue, setNoteEditorValue] = useState("")
  const [actionNote, setActionNote] = useState("")
  const [currentTimeMs, setCurrentTimeMs] = useState(0)

  const queryInput = useMemo(
    () => ({
      limit: 15,
      status: statusFilter === "ALL_ACTIVE" ? undefined : statusFilter,
      searchTerm: debouncedSearchTerm || undefined,
    }),
    [statusFilter, debouncedSearchTerm],
  )

  const {
    data: paginatedBookings,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.bookings.listForRentalTeam.useInfiniteQuery(queryInput, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: viewMode === "list",
  })

  // Flatten bookings and ensure item.totalQuantity is present (if not, fallback to 1)
  const bookings: BookingForRentalTeam[] =
    paginatedBookings?.pages.flatMap((page) =>
      page.bookings.map((booking) => ({
        ...booking,
        item: booking.item
          ? {
              ...booking.item,
              type: booking.item.type ?? null,
              totalQuantity:
                typeof (booking.item as { totalQuantity?: number })?.totalQuantity === "number"
                  ? (booking.item as { totalQuantity?: number }).totalQuantity!
                  : 1, // fallback if not present
            }
          : null,
      })),
    ) ?? []

  const updateStatusMutation = trpc.bookings.updateBookingStatusByTeam.useMutation({
    onSuccess: (updatedBooking) => {
      if (!active.current) return
      toast({
        title: t("rentalDashboard.statusUpdateSuccessTitle", {
          defaultValue: "Booking Status Updated",
        }),
        description: t("rentalDashboard.statusUpdateSuccessDesc", {
          bookingId: updatedBooking.id.substring(0, 8),
          status: t(`myBookings.tabs.${updatedBooking.status.toLowerCase()}`, {
            defaultValue: updatedBooking.status,
          }),
        }),
      })
      trpcUtils.bookings.listForRentalTeam.invalidate(queryInput)
      setShowActionModal(false)
      setSelectedBookingForAction(null)
    },
    onError: (err) => {
      if (!active.current) return
      toast({
        title: t("errors.title"),
        description: err.message || t("errors.unexpected"),
        variant: "destructive",
      })
      setShowActionModal(false)
    },
  })

  const addNoteMutation = trpc.bookings.addRentalNote.useMutation({
    onSuccess: (updatedBooking) => {
      if (!active.current) return
      toast({
        title: t("rentalDashboard.addNoteSuccessTitle", {
          defaultValue: "Note Added",
        }),
        description: t("rentalDashboard.addNoteSuccessDesc", {
          defaultValue: "Saved note for booking {bookingId}.",
          bookingId: updatedBooking.id.substring(0, 8),
        }),
      })
      setNoteEditorValue("")
      setNoteDialogBooking((prev) =>
        prev ? { ...prev, notes: updatedBooking.notes ?? null } : prev,
      )
      trpcUtils.bookings.listForRentalTeam.invalidate(queryInput)
    },
    onError: (err) => {
      if (!active.current) return
      toast({
        title: t("errors.title"),
        description: err.message || t("errors.unexpected"),
        variant: "destructive",
      })
    },
  })

  const addActionNoteMutation = trpc.bookings.addRentalNote.useMutation()

  useEffect(() => {
    const updateCurrentTime = () => setCurrentTimeMs(Date.now())
    updateCurrentTime()
    const intervalId = window.setInterval(updateCurrentTime, 60 * 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  function setShowActionModal(open: boolean) {
    setShowActionModalState(open)
    if (!open) {
      setActionNote("")
      addActionNoteMutation.reset()
    }
  }

  const openNotesDialog = (booking: BookingForRentalTeam) => {
    setNoteDialogBooking({ ...booking })
    setNoteEditorValue("")
  }

  const closeNotesDialog = () => {
    setNoteDialogBooking(null)
    setNoteEditorValue("")
    addNoteMutation.reset()
  }

  const handleNoteSubmit = () => {
    if (!noteDialogBooking) return
    const trimmed = noteEditorValue.trim()
    if (!trimmed) return
    addNoteMutation.mutate({
      bookingId: noteDialogBooking.id,
      note: trimmed,
    })
  }

  const noteEntries = noteDialogBooking ? splitNoteEntries(noteDialogBooking.notes) : []

  const handleActionClick = (booking: BookingForRentalTeam, newStatus: BookingStatus) => {
    setSelectedBookingForAction(booking)
    setActionToConfirm(newStatus)
    setActionNote("")
    setShowActionModal(true)
  }

  const confirmAction = async () => {
    if (
      !selectedBookingForAction ||
      !actionToConfirm ||
      updateStatusMutation.isPending ||
      addActionNoteMutation.isPending
    ) {
      return
    }

    const trimmedNote = actionNote.trim()

    if (actionToConfirm === BookingStatus.DECLINED && !trimmedNote) {
      return
    }

    try {
      if (trimmedNote) {
        await addActionNoteMutation.mutateAsync({
          bookingId: selectedBookingForAction.id,
          note: trimmedNote,
        })
      }
    } catch (error) {
      if (!active.current) return
      const message = error instanceof Error ? error.message : t("errors.unexpected")
      toast({
        title: t("errors.title"),
        description: message,
        variant: "destructive",
      })
      return
    }

    // An account change or route exit unmounts this workflow. Do not continue
    // its second request with a potentially different current session.
    if (!active.current) return
    updateStatusMutation.mutate({
      bookingId: selectedBookingForAction.id,
      newStatus: actionToConfirm,
    })
  }

  return {
    searchTermInput,
    setSearchTermInput,
    statusFilter,
    setStatusFilter,
    viewMode,
    setViewMode,
    showActionModal,
    setShowActionModal,
    selectedBookingForAction,
    actionToConfirm,
    noteDialogBooking,
    noteEditorValue,
    setNoteEditorValue,
    actionNote,
    setActionNote,
    currentTimeMs,
    bookings,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    updateStatusMutation,
    addNoteMutation,
    addActionNoteMutation,
    openNotesDialog,
    closeNotesDialog,
    handleNoteSubmit,
    noteEntries,
    handleActionClick,
    confirmAction,
  }
}
export type StaffBookingsController = ReturnType<typeof useStaffBookings>
