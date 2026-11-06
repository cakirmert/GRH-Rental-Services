"use client"

import { useState } from "react"
import { useCalendar } from "./calendar-provider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { isSameDay } from "date-fns"
import type { CalendarBooking } from "./types"
import { BookingStatus, ItemType } from "@prisma/client"
import { CalendarDays, Users, Package2, Tag as GameIcon, Info, Loader2 } from "lucide-react"
import { getAdminBlockReason, isAdminBlockBooking } from "@/utils/adminBlock"
import { formatBerlinDateTime, formatInBerlin as format, toBerlinDate } from "@/lib/berlin-time"

const statusColors: Record<BookingStatus, string> = {
  REQUESTED: "bg-status-requested text-status-requested-foreground",
  ACCEPTED: "bg-status-accepted text-status-accepted-foreground",
  BORROWED: "bg-status-borrowed text-status-borrowed-foreground",
  COMPLETED: "bg-status-completed text-status-completed-foreground",
  DECLINED: "bg-status-declined text-status-declined-foreground",
  CANCELLED: "bg-status-cancelled text-status-cancelled-foreground",
}

function getItemIcon(type: ItemType | null | undefined) {
  if (!type) return <Info className="h-4 w-4 mr-1.5" />
  switch (type) {
    case ItemType.ROOM:
      return <Users className="h-4 w-4 mr-1.5" />
    case ItemType.SPORTS:
      return <Package2 className="h-4 w-4 mr-1.5" />
    case ItemType.GAME:
      return <GameIcon className="h-4 w-4 mr-1.5" />
    default:
      return <Package2 className="h-4 w-4 mr-1.5" />
  }
}

export function BookingDialog() {
  const { selectedBooking } = useCalendar()
  return selectedBooking ? (
    <BookingDetails key={selectedBooking.id} booking={selectedBooking} />
  ) : null
}

function BookingDetails({ booking }: { booking: CalendarBooking }) {
  const { setSelectedBooking } = useCalendar()
  const { t, locale } = useI18n()
  const trpcUtils = trpc.useUtils()
  const [blockAction, setBlockAction] = useState<"occurrence" | "series" | null>(null)

  function blockChanged() {
    setSelectedBooking(null)
    void trpcUtils.bookings.getBookings.invalidate()
    void trpcUtils.bookings.listForRentalTeam.invalidate()
    void trpcUtils.bookings.availability.invalidate()
  }

  const cancelOccurrence = trpc.bookings.cancelBlockOccurrence.useMutation({
    onSuccess: blockChanged,
  })
  const stopSeries = trpc.bookings.stopBlockSeries.useMutation({ onSuccess: blockChanged })

  const updateMutation = trpc.bookings.updateBookingStatusByTeam.useMutation({
    onSuccess: () => {
      setSelectedBooking(null)
      trpcUtils.bookings.getBookings.invalidate()
      trpcUtils.bookings.listForRentalTeam.invalidate()
    },
  })
  const cancelBlockMutation = trpc.bookings.cancel.useMutation({
    onSuccess: blockChanged,
  })

  const now = toBerlinDate()
  const startTime = toBerlinDate(booking.startDate)
  const endTime = toBerlinDate(booking.endDate)
  const CAN_MARK_BORROWED_BEFORE_HOURS = 4
  const canMarkBorrowed =
    booking.status === BookingStatus.ACCEPTED &&
    startTime.getTime() <= now.getTime() + CAN_MARK_BORROWED_BEFORE_HOURS * 60 * 60 * 1000
  const isRecurringBlock = !!booking.recurringBlockId
  const isRepeating = isRecurringBlock && booking.frequency !== "NONE"
  const isAdminBlock = isRecurringBlock || isAdminBlockBooking(booking)
  const blockReason = getAdminBlockReason(booking.notes)
  const blockPending = cancelOccurrence.isPending || stopSeries.isPending
  const actionError =
    cancelOccurrence.error?.message ||
    stopSeries.error?.message ||
    cancelBlockMutation.error?.message ||
    updateMutation.error?.message
  const berlinStart = formatBerlinDateTime(startTime).replace("T", " ")
  const berlinEnd = formatBerlinDateTime(endTime).replace("T", " ")

  function confirmBlockAction() {
    if (!booking.recurringBlockId || !booking.occurrenceStart || !blockAction) return
    const input = {
      recurringBlockId: booking.recurringBlockId,
      occurrenceStart: new Date(booking.occurrenceStart).toISOString(),
    }
    if (blockAction === "series") stopSeries.mutate(input)
    else cancelOccurrence.mutate(input)
  }

  const renderAction = (status: BookingStatus, label: string) => (
    <Button
      size="sm"
      onClick={() => updateMutation.mutate({ bookingId: booking.id, newStatus: status })}
      className="mr-2"
    >
      {label}
    </Button>
  )

  return (
    <Dialog open onOpenChange={() => setSelectedBooking(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {getItemIcon(booking.item?.type)}
            {(locale === "de" && booking.item?.titleDe) ||
              booking.item?.titleEn ||
              t("calendar.booking")}
          </DialogTitle>
          <DialogDescription>
            {isRecurringBlock ? (
              `${berlinStart} – ${berlinEnd} · ${t("adminCalendar.block.berlinTime")}`
            ) : (
              <>
                {format(startTime, "PPp")}
                {" – "}
                {format(endTime, isSameDay(startTime, endTime) ? "p" : "PPp")}
                {` · ${t("adminCalendar.block.berlinTime")}`}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex items-center">
            <Badge
              variant="outline"
              className={
                isAdminBlock
                  ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-500/40"
                  : statusColors[booking.status]
              }
            >
              {isAdminBlock
                ? t("adminCalendar.block.badge")
                : t(`myBookings.tabs.${booking.status.toLowerCase()}`, {
                    defaultValue: booking.status,
                  })}
            </Badge>
          </div>
          {booking.user && (
            <div className="flex items-center">
              <CalendarDays className="h-4 w-4 mr-2" />
              {booking.user.name} ({booking.user.email})
            </div>
          )}
          {isRepeating && (
            <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
              <p className="font-medium">
                {t(`adminCalendar.block.${booking.frequency?.toLowerCase()}`)}
              </p>
              <p className="text-xs text-muted-foreground">
                {booking.until
                  ? t("adminCalendar.block.seriesUntil", {
                      date: formatBerlinDateTime(new Date(booking.until)).slice(0, 10),
                    })
                  : t("adminCalendar.block.noEndDate")}
              </p>
            </div>
          )}
          {isAdminBlock ? (
            <p className="whitespace-pre-wrap border-t pt-2 text-sm">
              {blockReason ?? t("adminCalendar.block.defaultReason")}
            </p>
          ) : (
            booking.notes && (
              <p className="whitespace-pre-wrap border-t pt-2 text-sm">{booking.notes}</p>
            )
          )}
        </div>
        {blockAction && (
          <div
            className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
            role="alert"
          >
            <p className="text-sm">
              {t(
                blockAction === "series"
                  ? "adminCalendar.block.confirmStop"
                  : "adminCalendar.block.confirmOccurrence",
                { date: berlinStart },
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={confirmBlockAction}
                disabled={blockPending}
              >
                {blockPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t(
                  blockAction === "series"
                    ? "adminCalendar.block.confirmStopButton"
                    : "adminCalendar.block.cancelBlock",
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setBlockAction(null)}
                disabled={blockPending}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        )}
        <DialogFooter className="flex-wrap gap-2 pt-4 sm:space-x-0">
          {isRecurringBlock ? (
            !blockAction && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!booking.occurrenceStart || blockPending}
                  onClick={() => setBlockAction("occurrence")}
                >
                  {t(
                    isRepeating
                      ? "adminCalendar.block.removeOccurrence"
                      : "adminCalendar.block.cancelBlock",
                  )}
                </Button>
                {isRepeating && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={!booking.occurrenceStart || blockPending}
                    onClick={() => setBlockAction("series")}
                  >
                    {t("adminCalendar.block.stopSeries")}
                  </Button>
                )}
              </>
            )
          ) : isAdminBlock ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => cancelBlockMutation.mutate({ id: booking.id })}
              disabled={cancelBlockMutation.isPending}
            >
              {cancelBlockMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("adminCalendar.block.cancelBlock")}
            </Button>
          ) : (
            <>
              {booking.status === BookingStatus.REQUESTED && (
                <>
                  {renderAction(
                    BookingStatus.ACCEPTED,
                    t("rentalDashboard.accept", { defaultValue: "Accept" }),
                  )}
                  {renderAction(
                    BookingStatus.DECLINED,
                    t("rentalDashboard.decline", { defaultValue: "Decline" }),
                  )}
                </>
              )}
              {booking.status === BookingStatus.ACCEPTED && (
                <>
                  {canMarkBorrowed &&
                    renderAction(
                      BookingStatus.BORROWED,
                      t("rentalDashboard.markBorrowed", { defaultValue: "Mark Borrowed" }),
                    )}
                  {renderAction(
                    BookingStatus.CANCELLED,
                    t("rentalDashboard.cancel", { defaultValue: "Cancel" }),
                  )}
                </>
              )}
              {booking.status === BookingStatus.BORROWED && (
                <>
                  {renderAction(
                    BookingStatus.COMPLETED,
                    t("rentalDashboard.markComplete", { defaultValue: "Mark Complete" }),
                  )}
                  {renderAction(
                    BookingStatus.CANCELLED,
                    t("rentalDashboard.cancel", { defaultValue: "Cancel" }),
                  )}
                </>
              )}
            </>
          )}
          {!isAdminBlock && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  localStorage.setItem("grh-open-chat-booking-id", booking.id)
                  window.dispatchEvent(
                    new CustomEvent("grh-open-chat", {
                      detail: { bookingId: booking.id },
                    }),
                  )
                  setSelectedBooking(null) // Close the dialog
                }}
              >
                {t("Chat.rentalDashboard")}
              </Button>
            </>
          )}
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              {t("common.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
