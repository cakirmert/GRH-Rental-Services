// src/components/RentalDashboardView.tsx
"use client"

import React, { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"
import { de as deLocaleFn, enUS as enUSLocaleFn } from "date-fns/locale"
import {
  ChevronLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  Hourglass,
  CalendarDays,
  UserCircle as UserIconLucide,
  Tag as ItemTypeUIIconRental,
  Info,
  Users,
  Package2,
  Edit3,
  MessageSquare,
  StickyNote,
  Mail,
  Clock,
  Loader2,
  AlertCircle as AlertCircleIcon,
} from "lucide-react"
import { trpc } from "@/utils/trpc"
import { type BookingForRentalTeam } from "@/types/booking"
import { BookingStatus, ItemType } from "@prisma/client"
import { format, parseISO, isSameDay } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useDebounce } from "@/hooks/useDebounce"
import { useSession } from "next-auth/react"

import { CalendarProvider } from "@/components/calendar/calendar-provider"
import { Calendar } from "@/components/calendar/calendar"
import DashboardHelpSheet from "./DashboardHelpSheet"
import NotAuthorized from "./NotAuthorized"
import { Spinner } from "@/components/ui/spinner"

interface RentalDashboardViewProps {
  onGoBack: () => void
}

const statusUiStyles: Record<BookingStatus, { colors: string; icon: React.ElementType }> = {
  [BookingStatus.REQUESTED]: {
    colors:
      "border-status-requested-foreground bg-status-requested text-status-requested-foreground",
    icon: Hourglass,
  },
  [BookingStatus.ACCEPTED]: {
    colors: "border-status-accepted-foreground bg-status-accepted text-status-accepted-foreground",
    icon: CheckCircle,
  },
  [BookingStatus.BORROWED]: {
    colors: "border-status-borrowed-foreground bg-status-borrowed text-status-borrowed-foreground",
    icon: Edit3,
  },
  [BookingStatus.COMPLETED]: {
    colors:
      "border-status-completed-foreground bg-status-completed text-status-completed-foreground",
    icon: CheckCircle,
  },
  [BookingStatus.DECLINED]: {
    colors: "border-status-declined-foreground bg-status-declined text-status-declined-foreground",
    icon: XCircle,
  },
  [BookingStatus.CANCELLED]: {
    colors:
      "border-status-cancelled-foreground bg-status-cancelled text-status-cancelled-foreground",
    icon: XCircle,
  },
}

const splitNoteEntries = (notes?: string | null) => {
  if (!notes) return []
  return notes
    .split(/\r?\n\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const getLatestNotePreview = (notes?: string | null) => {
  const entries = splitNoteEntries(notes)
  if (!entries.length) return null
  const latest = entries[entries.length - 1]
  const normalized = latest.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized
}

export default function RentalDashboardView({ onGoBack }: RentalDashboardViewProps) {
  const { t, locale: i18nLocale } = useI18n()
  const { data: session } = useSession()

  const localeMap = { en: enUSLocaleFn, de: deLocaleFn }
  const dateFnsLocale = localeMap[i18nLocale as keyof typeof localeMap] || enUSLocaleFn

  const trpcUtils = trpc.useUtils()

  const [searchTermInput, setSearchTermInput] = useState("")
  const debouncedSearchTerm = useDebounce(searchTermInput, 300)
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "ALL_ACTIVE">("ALL_ACTIVE")

  const [showActionModal, setShowActionModal] = useState(false)
  const [selectedBookingForAction, setSelectedBookingForAction] =
    useState<BookingForRentalTeam | null>(null)
  const [actionToConfirm, setActionToConfirm] = useState<BookingStatus | null>(null)
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list")
  const [noteDialogBooking, setNoteDialogBooking] = useState<BookingForRentalTeam | null>(null)
  const [noteEditorValue, setNoteEditorValue] = useState("")
  const [actionNote, setActionNote] = useState("")

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
    // placeholderData: keepPreviousData, // For TanStack Query v5+
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
      toast({
        title: t("errors.title"),
        description: err.message || t("errors.unexpected"),
        variant: "destructive",
      })
    },
  })

  const addActionNoteMutation = trpc.bookings.addRentalNote.useMutation()
  const { reset: resetActionNoteMutation } = addActionNoteMutation

  useEffect(() => {
    if (!showActionModal) {
      setActionNote("")
      resetActionNoteMutation()
    }
  }, [showActionModal, resetActionNoteMutation])

  // Check if user has rental team access (RENTAL or ADMIN role)
  const isRentalTeamMember = session?.user?.role === "RENTAL" || session?.user?.role === "ADMIN"
  
  // Show not authorized page if user is not part of rental team
  if (!isRentalTeamMember) {
    return <NotAuthorized onGoBack={onGoBack} requiredRole="RENTAL" />
  }

  const ensureDateRental = (dateInput: Date | string): Date => {
    // Renamed to avoid conflict
    return dateInput instanceof Date ? dateInput : parseISO(dateInput)
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
      const message = error instanceof Error ? error.message : t("errors.unexpected")
      toast({
        title: t("errors.title"),
        description: message,
        variant: "destructive",
      })
      return
    }

    updateStatusMutation.mutate({
      bookingId: selectedBookingForAction.id,
      newStatus: actionToConfirm,
    })
  }

  const getItemTitle = (item: BookingForRentalTeam["item"]) => {
    if (!item) return t("rentalDashboard.unknownItem", { defaultValue: "Unknown Item" })
    return i18nLocale === "de" && item.titleDe ? item.titleDe : item.titleEn
  }

  const getStatusLabelForAction = (status?: BookingStatus | null) => {
    if (!status) return "updated"
    const translation = t(`myBookings.tabs.${status.toLowerCase()}`, { defaultValue: status })
    return translation ? translation.toLowerCase() : status.toLowerCase()
  }

  const getItemTypeIcon = (type?: ItemType | null) => {
    if (!type) return <Info className="h-4 w-4 mr-1.5 text-primary" />
    switch (type) {
      case ItemType.ROOM:
        return <Users className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.SPORTS:
        return <Package2 className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.OTHER:
        return <Package2 className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.GAME:
        return <ItemTypeUIIconRental className="h-4 w-4 mr-1.5 text-primary" />
      default:
        return <Info className="h-4 w-4 mr-1.5 text-primary" />
    }
  }

  const getStatusBadge = (status: BookingStatus) => {
    const uiStyle = statusUiStyles[status] || statusUiStyles[BookingStatus.REQUESTED]
    const Icon = uiStyle.icon
    return (
      <Badge variant="outline" className={`text-xs px-2 py-1 border ${uiStyle.colors}`}>
        <Icon className="h-3 w-3 mr-1.5" />
        {t(`myBookings.tabs.${status.toLowerCase()}`, { defaultValue: status })}
      </Badge>
    )
  }
  const renderActionButtons = (booking: BookingForRentalTeam) => {
    const buttonClass = "flex-1 mt-1" // Use flex-1 to make buttons expand equally
    const startDate = new Date(booking.startDate)
    const CAN_MARK_BORROWED_BEFORE_HOURS = 4
    const canMarkBorrowed =
      booking.status === BookingStatus.ACCEPTED &&
      startDate.getTime() <= Date.now() + CAN_MARK_BORROWED_BEFORE_HOURS * 60 * 60 * 1000

    switch (booking.status) {
      case BookingStatus.REQUESTED:
        return (
          <>
            <Button
              size="sm"
              variant="constructive"
              className={`${buttonClass} accept-btn `}
              onClick={() => handleActionClick(booking, BookingStatus.ACCEPTED)}
            >
              <CheckCircle className="mr-1.5 h-4 w-4" />
              {t("rentalDashboard.accept", { defaultValue: "Accept" })}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className={buttonClass}
              onClick={() => handleActionClick(booking, BookingStatus.DECLINED)}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              {t("rentalDashboard.decline", { defaultValue: "Decline" })}
            </Button>
          </>
        )
      case BookingStatus.ACCEPTED:
        return (
          <>
            {canMarkBorrowed && (
              <Button
                size="sm"
                variant="constructive"
                className={buttonClass}
                onClick={() => handleActionClick(booking, BookingStatus.BORROWED)}
              >
                <Loader2 className="mr-1.5 h-4 w-4" />
                {t("rentalDashboard.markBorrowed", { defaultValue: "Mark Borrowed" })}
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              className={buttonClass}
              onClick={() => handleActionClick(booking, BookingStatus.CANCELLED)}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              {t("rentalDashboard.cancel", { defaultValue: "Cancel" })}
            </Button>
          </>
        )
      case BookingStatus.BORROWED:
        return (
          <>
            <Button
              size="sm"
              variant="outline"
              className={buttonClass}
              onClick={() => handleActionClick(booking, BookingStatus.COMPLETED)}
            >
              <CheckCircle className="mr-1.5 h-4 w-4" />
              {t("rentalDashboard.markComplete", { defaultValue: "Complete" })}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className={buttonClass}
              onClick={() => handleActionClick(booking, BookingStatus.CANCELLED)}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              {t("rentalDashboard.cancel", { defaultValue: "Cancel" })}
            </Button>
          </>
        )
      default:
        return (
          <span className="text-xs text-muted-foreground italic">
            {t("rentalDashboard.noActionsAvailable", { defaultValue: "No actions available" })}
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 p-1 sm:p-4 md:p-6 mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {t("header.rentalDashboardLink")}
        </h1>
        <div className="flex gap-2">
          <DashboardHelpSheet role="rental" />
          <Button
            variant="outline"
            size="sm"
            onClick={onGoBack}
            className="print:hidden flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("common.back")}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm sm:text-base">
        {t("rentalDashboard.description", {
          defaultValue: "Manage incoming booking requests and view the schedule.",
        })}
      </p>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Button
          id="rental-refresh-btn"
          onClick={() => refetch()}
          disabled={isLoading || isFetchingNextPage}
          size="sm"
          className="print:hidden self-start sm:self-center"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isLoading || isFetchingNextPage ? "animate-spin" : ""}`}
          />
          {t("rentalDashboard.refresh", { defaultValue: "Refresh" })}
        </Button>
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as "list" | "calendar")}
          className="w-full sm:w-fit mt-2 sm:mt-0"
        >
          <TabsList id="rental-view-tabs" className="grid w-full grid-cols-2">
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card id="rental-filter-card" className="print:hidden shadow-sm">
        <CardContent className="p-4 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
          <div className="flex-grow sm:flex-1 min-w-[200px]">
            <Label htmlFor="dashboard-search" className="text-xs font-medium">
              {t("rentalDashboard.searchLabel", { defaultValue: "Search bookings" })}
            </Label>
            <Input
              id="dashboard-search"
              type="text"
              placeholder={t("rentalDashboard.searchPlaceholder", {
                defaultValue: "Item, user name/email...",
              })}
              value={searchTermInput}
              onChange={(e) => setSearchTermInput(e.target.value)}
              className="h-9 mt-1"
            />
          </div>
          <div className="flex-grow sm:flex-none sm:w-auto min-w-[180px]">
            <Label htmlFor="status-filter" className="text-xs font-medium">
              {t("rentalDashboard.statusFilterLabel", { defaultValue: "Filter by Status" })}
            </Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as BookingStatus | "ALL_ACTIVE")}
            >
              <SelectTrigger id="status-filter" className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL_ACTIVE">
                  {t("rentalDashboard.statusAllActive", { defaultValue: "All Active (Default)" })}
                </SelectItem>
                {Object.values(BookingStatus).map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(`myBookings.tabs.${status.toLowerCase()}`, { defaultValue: status })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {viewMode === "list" && (
        <>
          {isLoading && !bookings.length && (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-lg" />
              ))}
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon className="h-5 w-5" />
              <AlertTitle>{t("errors.title")}</AlertTitle>
              <AlertDescription>{error.message || t("errors.fetchBookings")}</AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && bookings.length === 0 && (
            <Card className="text-center py-16 border-dashed">
              <CardContent className="flex flex-col items-center">
                <MessageSquare className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  {t("rentalDashboard.noBookingsFound", {
                    defaultValue: "No bookings match your current filters.",
                  })}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("rentalDashboard.tryDifferentFilters", {
                    defaultValue: "Try adjusting your search or status filter.",
                  })}
                </p>
              </CardContent>
            </Card>
          )}

          {bookings.length > 0 && (
            <div id="rental-booking-list" className="space-y-4">
              {bookings.map((booking) => {
                const bookingStatusStyle =
                  statusUiStyles[booking.status] || statusUiStyles[BookingStatus.REQUESTED]
                const borderColorClass = bookingStatusStyle.colors.split(" ")[0]
                const headerBgClass = `${borderColorClass} bg-muted/20 dark:bg-muted/40`
                const latestNotePreview = getLatestNotePreview(booking.notes)

                return (
                  <Card
                    key={booking.id}
                    className="overflow-hidden shadow-sm hover:shadow-md transition-shadow group"
                  >
                    <CardHeader
                      className={`p-3 sm:p-4 border-b ${headerBgClass} group-hover:bg-muted/30 dark:group-hover:bg-muted/50 transition-colors`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2">
                        <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                          {getItemTypeIcon(booking.item?.type)}
                          {getItemTitle(booking.item)}
                        </CardTitle>
                        {getStatusBadge(booking.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-[1.5fr_2fr_1fr] gap-3 md:gap-4 items-start text-sm">
                      <div className="space-y-1.5">
                        <div className="flex items-center text-muted-foreground">
                          <UserIconLucide className="h-4 w-4 mr-2 shrink-0" />
                          <span className="font-medium text-card-foreground">
                            {booking.user?.name || t("common.unknown", { defaultValue: "N/A" })}
                          </span>
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground truncate">
                          <Mail className="h-3.5 w-3.5 mr-2 shrink-0" />
                          <span>
                            {booking.user?.email || t("common.unknown", { defaultValue: "N/A" })}
                          </span>
                        </div>
                        {typeof booking.item?.totalQuantity === "number" &&
                          booking.item.totalQuantity > 1 && (
                            <div className="flex items-center text-xs text-muted-foreground">
                              <Package2 className="h-3.5 w-3.5 mr-2 shrink-0" />
                              <span>
                                {t("myBookings.quantityLabel", { defaultValue: "Quantity" })}:{" "}
                                {booking.quantity}
                              </span>
                            </div>
                          )}
                        {latestNotePreview && (
                          <div className="mt-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-xs text-muted-foreground">
                            <div className="font-medium text-card-foreground">
                              {t("rentalDashboard.latestNoteLabel", { defaultValue: "Latest note" })}
                            </div>
                            <p className="mt-1 leading-relaxed">
                              {latestNotePreview}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center text-muted-foreground">
                          <CalendarDays className="h-4 w-4 mr-2 shrink-0" />
                          <span>
                            {format(ensureDateRental(booking.startDate), "PPp", {
                              locale: dateFnsLocale,
                            })}
                          </span>
                        </div>
                        <div className="flex items-center text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 mr-2 shrink-0" />
                          <span>
                            {t("rentalDashboard.to", { defaultValue: "to" })}{" "}
                            {format(
                              ensureDateRental(booking.endDate),
                              isSameDay(
                                ensureDateRental(booking.startDate),
                                ensureDateRental(booking.endDate),
                              )
                                ? "p"
                                : "PPp",
                              { locale: dateFnsLocale },
                            )}
                          </span>
                        </div>
                        {booking.assignedTo && (
                          <div className="text-xs text-muted-foreground pt-1 flex items-center">
                            <UserIconLucide className="h-3.5 w-3.5 mr-1.5 opacity-80" />
                            {t("myBookings.assignedTo")}:{" "}
                            {booking.assignedTo.name || booking.assignedTo.email}
                          </div>
                        )}{" "}
                      </div>
                      <div className="md:text-right print:hidden">
                        <div className="flex w-full flex-col gap-2">
                          <Button
                            size="default"
                            variant="default"
                            className="w-full booking-chat-btn"
                            onClick={() => {
                              localStorage.setItem("grh-open-chat-booking-id", booking.id)
                              window.dispatchEvent(
                                new CustomEvent("grh-open-chat", {
                                  detail: { bookingId: booking.id },
                                }),
                              )
                            }}
                          >
                            <MessageSquare className="mr-1.5 h-4 w-4" />
                            {t("rentalDashboard.chatWithUser", {
                              defaultValue: `Chat with ${(booking.user?.name || booking.user?.email || "User").split(" ")[0]}`,
                              name: booking.user?.name || booking.user?.email || "User",
                            })}
                          </Button>
                          <Button
                            size="default"
                            variant="outline"
                            className="w-full booking-notes-btn"
                            onClick={() => openNotesDialog(booking)}
                          >
                            <StickyNote className="mr-1.5 h-4 w-4" />
                            {t("rentalDashboard.notesButton", { defaultValue: "View/Add Notes" })}
                          </Button>
                        </div>
                        <div className="flex mt-2 gap-2 w-full">{renderActionButtons(booking)}</div>
                      </div>

                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {viewMode === "calendar" && (
        <CalendarProvider>
          <Calendar />
        </CalendarProvider>
      )}
      {viewMode === "list" && hasNextPage && (
        <div className="mt-6 text-center print:hidden">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage || isLoading}
            variant="outline"
            size="sm"
          >
            {isFetchingNextPage && <Spinner className="mr-2 size-4" />}
            {t("rentalDashboard.loadMore", { defaultValue: "Load More Bookings" })}
          </Button>
        </div>
      )}

      <Dialog open={Boolean(noteDialogBooking)} onOpenChange={(open) => {
        if (!open) {
          closeNotesDialog()
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("rentalDashboard.notesDialogTitle", { defaultValue: "Booking Notes" })}
            </DialogTitle>
            <DialogDescription>
              {t("rentalDashboard.notesDialogDescription", {
                defaultValue: "Share internal updates with your rental team.",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {noteDialogBooking && (
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("rentalDashboard.notesForBooking", { defaultValue: "Booking" })}
                </Label>
                <div className="mt-1 text-sm font-semibold text-card-foreground">
                  {getItemTitle(noteDialogBooking.item)}
                </div>
                <div className="text-xs text-muted-foreground">
                  #{noteDialogBooking.id.substring(0, 8)}
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs font-medium text-muted-foreground">
                {t("rentalDashboard.existingNotes", { defaultValue: "Existing notes" })}
              </Label>
              {noteEntries.length ? (
                <div className="mt-2 space-y-3 max-h-64 overflow-y-auto pr-1">
                  {noteEntries.map((entry, index) => (
                    <div
                      key={`${noteDialogBooking?.id ?? "note"}-${index}`}
                      className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 p-3 text-sm whitespace-pre-wrap leading-relaxed"
                    >
                      {entry}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("rentalDashboard.noNotes", { defaultValue: "No notes yet." })}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rental-add-note" className="text-xs font-medium text-muted-foreground">
                {t("rentalDashboard.addNoteLabel", { defaultValue: "Add a note" })}
              </Label>
              <Textarea
                id="rental-add-note"
                value={noteEditorValue}
                onChange={(event) => setNoteEditorValue(event.target.value)}
                placeholder={t("rentalDashboard.addNotePlaceholder", {
                  defaultValue: "Write details the rental team should remember...",
                })}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                onClick={closeNotesDialog}
                disabled={addNoteMutation.isPending}
              >
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              onClick={handleNoteSubmit}
              disabled={addNoteMutation.isPending || !noteEditorValue.trim()}
            >
              {addNoteMutation.isPending && <Spinner className="mr-2 size-4" />}
              {t("rentalDashboard.addNoteSubmit", { defaultValue: "Save Note" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showActionModal} onOpenChange={setShowActionModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("rentalDashboard.confirmActionTitle", { defaultValue: "Confirm Action" })}
            </DialogTitle>
            <DialogDescription>
              {t("rentalDashboard.confirmActionGenericDesc", {
                statusLabel: getStatusLabelForAction(actionToConfirm),
                itemName: selectedBookingForAction?.item
                  ? getItemTitle(selectedBookingForAction.item)
                  : t("rentalDashboard.unknownItem", { defaultValue: "Item" }),
                userName: selectedBookingForAction?.user?.name || "user",
              })}
            </DialogDescription>
          </DialogHeader>
          {actionToConfirm === BookingStatus.DECLINED && (
            <>
              <Alert variant="destructive" className="mb-4 flex items-start gap-3">
                <AlertCircleIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="text-sm leading-relaxed">
                  <p className="font-semibold">
                    {t("rentalDashboard.declineNoteReminderTitle", { defaultValue: "Add a decline note" })}
                  </p>
                  <p>
                    {t("rentalDashboard.declineNoteReminderBody", {
                      defaultValue: "Please leave a note with the reason so the team has context.",
                    })}
                  </p>
                </div>
              </Alert>
              <div className="space-y-2">
                <Label
                  htmlFor="rental-action-note"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t("rentalDashboard.rentalNotesLabel", {
                    defaultValue: "Notes for this action (optional, may be visible to user)",
                  })}
                </Label>
                <Textarea
                  id="rental-action-note"
                  value={actionNote}
                  onChange={(event) => setActionNote(event.target.value)}
                  placeholder={t("rentalDashboard.rentalNotesPlaceholder", {
                    defaultValue: "e.g., Reason for decline, pickup instructions...",
                  })}
                  rows={4}
                />
              </div>
            </>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                disabled={
                  updateStatusMutation.isPending || addActionNoteMutation.isPending
                }
              >
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              onClick={confirmAction}
              disabled={
                updateStatusMutation.isPending ||
                addActionNoteMutation.isPending ||
                (actionToConfirm === BookingStatus.DECLINED && !actionNote.trim())
              }
              variant={actionToConfirm === BookingStatus.DECLINED ? "destructive" : "default"}
            >
              {(updateStatusMutation.isPending || addActionNoteMutation.isPending) && (
                <Spinner className="mr-2 size-4" />
              )}

              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
