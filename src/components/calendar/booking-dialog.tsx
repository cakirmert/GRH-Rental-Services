"use client"

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
import { format, isSameDay } from "date-fns"
import type { CalendarBooking } from "./types"
import { BookingStatus, ItemType } from "@prisma/client"
import { CalendarDays, Users, Package2, Tag as GameIcon, Info } from "lucide-react"

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
  const { selectedBooking, setSelectedBooking } = useCalendar()
  const { t } = useI18n()
  const trpcUtils = trpc.useUtils()

  const updateMutation = trpc.bookings.updateBookingStatusByTeam.useMutation({
    onSuccess: () => {
      setSelectedBooking(null)
      trpcUtils.bookings.getBookings.invalidate()
    },
  })

  if (!selectedBooking) return null

  const booking = selectedBooking as CalendarBooking

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
    <Dialog open={!!selectedBooking} onOpenChange={() => setSelectedBooking(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            {getItemIcon(booking.item?.type)}
            {booking.item?.titleEn || "Booking"}
          </DialogTitle>
          <DialogDescription>
            {format(new Date(booking.startDate), "PPp")}
            {" – "}
            {format(
              new Date(booking.endDate),
              isSameDay(new Date(booking.startDate), new Date(booking.endDate)) ? "p" : "PPp",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex items-center">
            <Badge variant="outline" className={statusColors[booking.status]}>
              {t(`myBookings.tabs.${booking.status.toLowerCase()}`, {
                defaultValue: booking.status,
              })}
            </Badge>
          </div>
          <div className="flex items-center">
            <CalendarDays className="h-4 w-4 mr-2" />
            {booking.user?.name} ({booking.user?.email})
          </div>
          {booking.notes && (
            <p className="whitespace-pre-wrap border-t pt-2 text-sm">{booking.notes}</p>
          )}
        </div>
        <DialogFooter className="pt-4 space-x-2">
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
          {booking.status === BookingStatus.ACCEPTED &&
            renderAction(
              BookingStatus.CANCELLED,
              t("rentalDashboard.cancel", { defaultValue: "Cancel" }),
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
          )}{" "}
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
