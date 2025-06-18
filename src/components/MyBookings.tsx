// src/components/MyBookingsComponent.tsx
"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState, useRef, useMemo } from "react"
import { format, parseISO, isPast, isSameDay, differenceInCalendarDays, startOfDay } from "date-fns"
import { de as deLocale } from "date-fns/locale"
import {
  Calendar as CalendarIcon,
  Clock,
  Loader2,
  Mail,
  Edit,
  X,
  Info,
  ChevronLeft,
  AlertCircle,
  Users,
  Package2,
  Tag as ItemTypeUIIcon,
  MessageSquare,
} from "lucide-react"
import { trpc } from "@/utils/trpc"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { Skeleton } from "@/components/ui/skeleton"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import { useI18n } from "@/locales/i18n"
import TimeSelect from "@/components/TimeSelect"
import { type DateRange } from "react-day-picker"
import { BookingStatus, ItemType } from "@prisma/client"

interface ItemFromBooking {
  // Renamed to avoid conflict with Prisma's ItemType
  id: string
  titleEn: string
  titleDe?: string | null
  descriptionEn?: string | null
  descriptionDe?: string | null
  rulesEn?: string | null
  rulesDe?: string | null
  type: ItemType
  capacity?: number | null
  players?: string | null
  imagesJson?: string | null
  totalQuantity: number
  active: boolean
  createdAt: string | Date
  updatedAt: string | Date
}
interface UserFromBooking {
  // Renamed
  id: string
  name?: string | null
  email?: string | null // Kept optional as in your original
}
interface BookingFromList {
  // Main type, closer to your original
  id: string
  userId: string
  itemId: string
  startDate: string | Date
  endDate: string | Date
  status: BookingStatus
  quantity: number // Added quantity field
  notes?: string | null
  assignedToId?: string | null
  createdAt: string | Date
  updatedAt: string | Date
  item: ItemFromBooking
  user?: UserFromBooking
  assignedTo?: UserFromBooking | null
}

interface MyBookingsComponentProps {
  highlightBookingId?: string | null
  onGoBackToList: () => void
}

export default function MyBookingsComponent({
  highlightBookingId,
  onGoBackToList,
}: MyBookingsComponentProps) {
  const { status: sessionStatus } = useSession()
  const { t, locale: i18nLocale } = useI18n()
  const dateFnsLocale = i18nLocale === "de" ? deLocale : undefined

  const [activeTab, setActiveTab] = useState<BookingStatus | "all">("all")
  const [selectedBooking, setSelectedBooking] = useState<BookingFromList | null>(null)

  const [showDetails, setShowDetails] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [notifHighlightId, setNotifHighlightId] = useState<string | null>(null)

  const [editDateRange, setEditDateRange] = useState<DateRange | undefined>(undefined)
  const [editStartTime, setEditStartTime] = useState("")
  const [editEndTime, setEditEndTime] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editError, setEditError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const highlightedBookingRef = useRef<HTMLDivElement>(null)
  const isDesktop = useMediaQuery("(min-width: 768px)")

  useEffect(() => {
    const id = localStorage.getItem("grh-highlight-booking-id")
    if (id) {
      setNotifHighlightId(id)
      localStorage.removeItem("grh-highlight-booking-id")
    }
  }, [])

  const {
    data: userBookingsData,
    isLoading,
    error: fetchBookingsError,
    refetch,
  } = trpc.bookings.list.useQuery(
    { all: false },
    {
      enabled: sessionStatus === "authenticated",
      // tRPC's default transformer (superjson) should handle Date objects.
      // If dates are strings, casting to `any` then `BookingFromList[]` or adding a `select` transform is needed.
    },
  )

  const allBookings: BookingFromList[] = useMemo(
    () => (userBookingsData || []) as BookingFromList[],
    [userBookingsData],
  )

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

  const activeHighlightId = highlightBookingId || notifHighlightId

  useEffect(() => {
    if (
      activeHighlightId &&
      highlightedBookingRef.current &&
      !isLoading &&
      allBookings.length > 0
    ) {
      const element = highlightedBookingRef.current
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
          element.classList.add("animate-pulse-bg")
          setTimeout(() => element.classList.remove("animate-pulse-bg"), 2500)
        }, 100)
      }
    }
  }, [activeHighlightId, allBookings, isLoading])

  const combineDateTime = (d: Date | undefined, timeStr: string): Date => {
    if (!d) throw new Error(t("errors.selectDate"))
    const [hh, mm] = timeStr.split(":").map(Number)
    if (isNaN(hh) || isNaN(mm)) throw new Error(t("errors.invalidTimeFormat"))
    const newDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm) // More robust Date creation
    return newDate
  }

  // Ensure dates are Date objects before passing to date-fns
  const ensureDateObject = (dateInput: Date | string): Date => {
    return dateInput instanceof Date ? dateInput : parseISO(dateInput)
  }

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
      if (isPast(s) && !isSameDay(s, new Date())) {
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

  const getStatusBadgeVariant = (
    status: BookingStatus,
  ): "default" | "destructive" | "outline" | "secondary" => {
    // ... (same as your working version)
    switch (status) {
      case "ACCEPTED":
        return "default"
      case "REQUESTED":
        return "secondary"
      case "DECLINED":
        return "destructive"
      case "CANCELLED":
        return "outline"
      case "COMPLETED":
        return "secondary"
      case "BORROWED":
        return "default" // Changed to default for borrowed as it's active
      default:
        return "default"
    }
  }

  const formatStatusDisplay = (status: BookingStatus | string): string => {
    const key = `myBookings.tabs.${status.toString().toLowerCase()}` // Match keys like "myBookings.tabs.requested"
    return t(key, {
      defaultValue:
        status.toString().charAt(0).toUpperCase() + status.toString().slice(1).toLowerCase(),
    })
  }

  const getItemTitle = (item: ItemFromBooking) => {
    return i18nLocale === "de" && item.titleDe ? item.titleDe : item.titleEn
  }

  const getItemTypeIcon = (type: ItemType) => {
    switch (type) {
      case ItemType.ROOM:
        return <Users className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.SPORTS:
        return <Package2 className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.GAME:
        return <ItemTypeUIIcon className="h-4 w-4 mr-1.5 text-primary" />
      case ItemType.OTHER:
        return <Package2 className="h-4 w-4 mr-1.5 text-primary" />
      default:
        return <Info className="h-4 w-4 mr-1.5 text-primary" />
    }
  }

  const canUserEditOrCancel = (status: BookingStatus): boolean => {
    return status === BookingStatus.REQUESTED || status === BookingStatus.ACCEPTED
  }

  if (isLoading || sessionStatus === "loading") {
    /* ... skeleton UI (same as your working version) ... */
    return (
      <div className="w-full mx-auto py-8 px-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <Skeleton className="h-10 w-48 rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
        <Skeleton className="h-10 w-full mb-6 rounded-md" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-48 w-full mb-4 rounded-lg" />
        ))}
      </div>
    )
  }

  const filteredBookingsToDisplay =
    activeTab === "all" ? allBookings : allBookings.filter((b) => b.status === activeTab)

  return (
    <div className="w-full mx-auto py-8 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("myBookings.title")}</h1>
        <Button variant="outline" onClick={onGoBackToList} size="sm">
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t("myBookings.browseItemsButton")}
        </Button>
      </div>

      <div className="mb-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as BookingStatus | "all")}
          className="w-full"
        >
          <TabsList className={cn("grid w-full h-auto", isDesktop ? "grid-cols-7" : "grid-cols-3")}>
            <TabsTrigger value="all" className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 h-auto">
              {t("myBookings.tabs.all")}
            </TabsTrigger>
            {(Object.values(BookingStatus) as Array<BookingStatus>)
              // Corrected filter logic:
              .filter(
                (key) =>
                  isDesktop ||
                  key === BookingStatus.REQUESTED ||
                  key === BookingStatus.ACCEPTED ||
                  key === BookingStatus.BORROWED,
              )
              .map((key) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 h-auto"
                >
                  {t(`myBookings.tabs.${key.toLowerCase()}`)}
                </TabsTrigger>
              ))}
          </TabsList>
          {!isDesktop && (
            <TabsList className="grid w-full grid-cols-4 h-auto mt-1">
              {(Object.values(BookingStatus) as Array<BookingStatus>)
                // Corrected filter logic:
                .filter(
                  (key) =>
                    !(
                      key === BookingStatus.REQUESTED ||
                      key === BookingStatus.ACCEPTED ||
                      key === BookingStatus.BORROWED
                    ),
                )
                .map((key) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="text-xs sm:text-sm px-2 sm:px-3 py-1.5 h-auto"
                  >
                    {t(`myBookings.tabs.${key.toLowerCase()}`)}
                  </TabsTrigger>
                ))}
            </TabsList>
          )}
        </Tabs>
      </div>

      {filteredBookingsToDisplay.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center min-h-[250px]">
            <Info className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground mb-2">
              {t("myBookings.noBookingsFound", {
                status:
                  activeTab !== "all"
                    ? formatStatusDisplay(activeTab)
                    : t("myBookings.tabs.allLower", { defaultValue: "all" }),
              })}
            </p>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {t("myBookings.noBookingsFoundDesc", {
                defaultValue:
                  "It looks like you don't have any bookings with this status yet. Why not explore some items?",
              })}
            </p>
            <Button variant="default" onClick={onGoBackToList}>
              {t("myBookings.browseItemsButton")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBookingsToDisplay.map((booking) => (
            <Card
              key={booking.id}
              ref={booking.id === activeHighlightId ? highlightedBookingRef : null}
              className={cn(
                "overflow-hidden transition-all hover:shadow-lg group",
                booking.status === BookingStatus.CANCELLED ||
                  booking.status === BookingStatus.DECLINED
                  ? "opacity-70"
                  : "",
              )}
            >
              <CardHeader className="p-4 border-b bg-card group-hover:bg-muted/30 transition-colors">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                  <div className="flex-grow">
                    <CardTitle className="text-md sm:text-lg font-semibold leading-tight flex items-center">
                      {getItemTypeIcon(booking.item.type)}
                      {getItemTitle(booking.item)}
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      {t("myBookings.bookedOn", {
                        date: format(ensureDateObject(booking.createdAt), "PP", {
                          locale: dateFnsLocale,
                        }),
                      })}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={getStatusBadgeVariant(booking.status)}
                    className="text-xs px-2.5 py-1 h-fit mt-1 sm:mt-0 w-fit sm:w-auto shadow-sm"
                  >
                    {formatStatusDisplay(booking.status)}
                  </Badge>
                </div>
              </CardHeader>{" "}
              <CardContent className="p-4 text-sm space-y-2.5">
                <div className="flex items-center text-muted-foreground">
                  <CalendarIcon className="h-4 w-4 mr-2.5 flex-shrink-0" />
                  <span>
                    {format(ensureDateObject(booking.startDate), "EEE, MMM d, yyyy", {
                      locale: dateFnsLocale,
                    })}
                  </span>
                </div>
                <div className="flex items-center text-muted-foreground">
                  <Clock className="h-4 w-4 mr-2.5 flex-shrink-0" />
                  <span>
                    {format(ensureDateObject(booking.startDate), "p", { locale: dateFnsLocale })} –{" "}
                    {format(ensureDateObject(booking.endDate), "p", { locale: dateFnsLocale })}
                    {!isSameDay(
                      ensureDateObject(booking.startDate),
                      ensureDateObject(booking.endDate),
                    ) && ` (${t("myBookings.nextDayIndicator", { defaultValue: "next day" })})`}
                  </span>
                </div>{" "}
                {(booking.item.totalQuantity ?? 1) > 1 && (
                  <div className="flex items-center text-muted-foreground">
                    <Package2 className="h-4 w-4 mr-2.5 flex-shrink-0" />
                    <span>
                      {t("myBookings.quantityLabel", { defaultValue: "Quantity" })}:{" "}
                      {booking.quantity}
                    </span>
                  </div>
                )}
                {booking.assignedTo &&
                  (booking.status === BookingStatus.ACCEPTED ||
                    booking.status === BookingStatus.BORROWED) && (
                    /* ... AssignedTo display ... */ <div className="text-xs text-muted-foreground pt-1.5 flex items-center">
                      <Mail className="h-3.5 w-3.5 mr-1.5 opacity-80" />
                      {t("myBookings.assignedTo")}:{" "}
                      {booking.assignedTo.name || booking.assignedTo.email}
                    </div>
                  )}
              </CardContent>
              <CardFooter className="p-3 flex flex-col sm:flex-row justify-between items-center gap-2 bg-muted/20 border-t group-hover:bg-muted/40 transition-colors">
                {/* ... Buttons (same as your working version, with canUserEditOrCancel) ... */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedBooking(booking)
                    setShowDetails(true)
                  }}
                  className="text-xs h-8 px-3 w-full sm:w-auto"
                >
                  {t("myBookings.viewDetailsButton")}
                </Button>
                <div className="flex space-x-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8 px-3 flex-1 sm:flex-none"
                    onClick={() => {
                      localStorage.setItem("grh-open-chat-booking-id", booking.id)
                      window.dispatchEvent(
                        new CustomEvent("grh-open-chat", {
                          detail: { bookingId: booking.id },
                        }),
                      )
                    }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" />{" "}
                    {booking.assignedTo
                      ? t("myBookings.chatWithAssigned", {
                          defaultValue: "Chat with {name}",
                          name: booking.assignedTo.name || booking.assignedTo.email || "Team",
                        })
                      : t("Chat.MyBookings", { defaultValue: "Chat" })}
                  </Button>
                  {canUserEditOrCancel(booking.status) && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-8 px-3 flex-1 sm:flex-none"
                        onClick={() => prepareEditForm(booking)}
                      >
                        <Edit className="h-3.5 w-3.5 mr-1.5" />
                        {t("myBookings.editButton")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="text-xs h-8 px-3 flex-1 sm:flex-none"
                        onClick={() => {
                          setSelectedBooking(booking)
                          setShowCancelDialog(true)
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />
                        {t("myBookings.cancelButton")}
                      </Button>
                    </>
                  )}
                  {(booking.status === BookingStatus.COMPLETED ||
                    booking.status === BookingStatus.CANCELLED ||
                    booking.status === BookingStatus.DECLINED) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={onGoBackToList}
                      className="text-xs h-8 px-3 w-full sm:w-auto"
                    >
                      {t("myBookings.bookAgainButton")}
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-md">
          {selectedBooking && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {getItemTypeIcon(selectedBooking.item.type)}
                  {getItemTitle(selectedBooking.item)}
                </DialogTitle>
                <DialogDescription>
                  {t("myBookings.detailsDialogDescription")}{" "}
                  <code className="text-xs">{selectedBooking.id.substring(0, 12)}...</code>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-3 max-h-[60vh] overflow-y-auto text-sm pr-2">
                <h4 className="font-medium text-xs uppercase text-muted-foreground tracking-wider">
                  {t("myBookings.detailsBookingInfoTitle")}
                </h4>{" "}
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 items-center">
                  <span className="text-muted-foreground">{t("common.status")}:</span>
                  <Badge variant={getStatusBadgeVariant(selectedBooking.status)} className="w-fit">
                    {formatStatusDisplay(selectedBooking.status)}
                  </Badge>
                  <span className="text-muted-foreground">{t("common.date")}:</span>
                  <span>
                    {format(ensureDateObject(selectedBooking.startDate), "PPP", {
                      locale: dateFnsLocale,
                    })}
                    {!isSameDay(
                      ensureDateObject(selectedBooking.startDate),
                      ensureDateObject(selectedBooking.endDate),
                    ) &&
                      ` - ${format(ensureDateObject(selectedBooking.endDate), "PPP", { locale: dateFnsLocale })}`}
                  </span>
                  <span className="text-muted-foreground">{t("common.time")}:</span>
                  <span>
                    {format(ensureDateObject(selectedBooking.startDate), "p", {
                      locale: dateFnsLocale,
                    })}{" "}
                    -{" "}
                    {format(ensureDateObject(selectedBooking.endDate), "p", {
                      locale: dateFnsLocale,
                    })}
                  </span>{" "}
                  {(selectedBooking.item.totalQuantity ?? 1) > 1 && (
                    <>
                      <span className="text-muted-foreground">
                        {t("myBookings.quantityLabel", { defaultValue: "Quantity" })}:
                      </span>
                      <span>{selectedBooking.quantity}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">{t("myBookings.bookedOnLabel")}:</span>
                  <span>
                    {format(ensureDateObject(selectedBooking.createdAt), "PPp", {
                      locale: dateFnsLocale,
                    })}
                  </span>
                </div>
                {selectedBooking.notes && (
                  <div className="mt-4 p-3 bg-secondary/30 rounded-md">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("myBookings.detailsNotesLabel")}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{selectedBooking.notes}</div>
                  </div>
                )}
                {selectedBooking.assignedTo && (
                  <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-md">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("myBookings.assignedTo")}
                    </div>
                    <div className="text-sm flex items-center">
                      <Mail className="h-4 w-4 mr-2 text-primary" />
                      <span className="font-medium">
                        {selectedBooking.assignedTo.name || selectedBooking.assignedTo.email}
                      </span>
                      {selectedBooking.assignedTo.name && selectedBooking.assignedTo.email && (
                        <span className="text-muted-foreground ml-2">
                          ({selectedBooking.assignedTo.email})
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t("common.close")}</Button>
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Booking Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("myBookings.editDialogTitle")}</DialogTitle>
            <DialogDescription>
              {selectedBooking?.status === BookingStatus.ACCEPTED
                ? t("myBookings.editAcceptedWarning", {
                    defaultValue:
                      "Note: Editing an accepted booking will revert its status to 'Requested' for re-approval.",
                  })
                : t("myBookings.editDialogDescription")}
            </DialogDescription>
          </DialogHeader>
          {selectedBooking /* ... Edit form content (same as your working version, with ensureDateObject if needed)... */ && (
            <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              {editError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t("errors.title")}</AlertTitle>
                  <AlertDescription>{editError}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="edit-date-popover">{t("bookingForm.selectDateRangeLabel")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="edit-date-popover"
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editDateRange?.from && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editDateRange?.from ? (
                        editDateRange.to ? (
                          `${format(editDateRange.from, "PPP", { locale: dateFnsLocale })} - ${format(editDateRange.to, "PPP", { locale: dateFnsLocale })}`
                        ) : (
                          format(editDateRange.from, "PPP", { locale: dateFnsLocale })
                        )
                      ) : (
                        <span>{t("bookingForm.selectDateRangeLabel")}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={editDateRange}
                      onSelect={setEditDateRange}
                      initialFocus
                      disabled={(date) =>
                        date < startOfDay(new Date()) ||
                        (!!editDateRange?.from &&
                          differenceInCalendarDays(date, editDateRange.from) > 1 &&
                          !isSameDay(date, editDateRange.from))
                      }
                      numberOfMonths={1}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TimeSelect
                  value={editStartTime}
                  onChange={setEditStartTime}
                  label={t("bookingForm.startTimeLabel")}
                  disabled={!editDateRange?.from}
                />
                <TimeSelect
                  value={editEndTime}
                  onChange={setEditEndTime}
                  label={t("bookingForm.endTimeLabel")}
                  disabled={!editDateRange?.from}
                  otherSelectedTime={editStartTime}
                  isEndTimeSelector={true}
                  shouldFilterTimes={
                    editDateRange?.from &&
                    (!editDateRange.to || isSameDay(editDateRange.from, editDateRange.to))
                  }
                />
              </div>{" "}
              <div className="space-y-1.5">
                <Label htmlFor="edit-notes">
                  {t("common.notes")} ({t("common.optional")})
                </Label>
                <Textarea
                  id="edit-notes"
                  placeholder={t("bookingForm.notesPlaceholder", {
                    itemType: getItemTitle(selectedBooking.item),
                  })}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">{t("bookingForm.notesGuidance")}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isSubmitting}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button onClick={handleUpdateBooking} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.saveChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Booking Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("myBookings.cancelDialogTitle")}</DialogTitle>
            {selectedBooking && (
              <DialogDescription>
                {t("myBookings.cancelDialogDescription", {
                  item: getItemTitle(selectedBooking.item),
                })}
              </DialogDescription>
            )}
          </DialogHeader>
          {selectedBooking && (
            <div className="py-2 text-sm space-y-1">
              <div>
                <span className="font-medium mr-1">{t("myBookings.cancelItemLabel")}</span>
                {getItemTitle(selectedBooking.item)}
              </div>
              <div>
                <span className="font-medium mr-1">{t("myBookings.cancelDateLabel")}</span>
                {format(ensureDateObject(selectedBooking.startDate), "PPP", {
                  locale: dateFnsLocale,
                })}
              </div>
              <div>
                <span className="font-medium mr-1">{t("myBookings.cancelTimeLabel")}</span>
                {format(ensureDateObject(selectedBooking.startDate), "p", {
                  locale: dateFnsLocale,
                })}{" "}
                –{" "}
                {format(ensureDateObject(selectedBooking.endDate), "p", { locale: dateFnsLocale })}
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={cancelBookingMutation.isPending}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              onClick={() =>
                selectedBooking && cancelBookingMutation.mutate({ id: selectedBooking.id })
              }
              disabled={cancelBookingMutation.isPending}
            >
              {cancelBookingMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("myBookings.confirmCancelButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
