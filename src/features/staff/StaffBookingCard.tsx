"use client"

import { Button } from "@/components/ui/button"
import {
  CalendarDays,
  UserCircle as UserIconLucide,
  Package2,
  MessageSquare,
  StickyNote,
  Mail,
  Clock,
} from "lucide-react"
import { type BookingForRentalTeam } from "@/types/booking"
import { BookingStatus } from "@prisma/client"
import { isSameDay } from "date-fns"
import { berlinContext, formatInBerlin } from "@/lib/berlin-time"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getLatestNotePreview } from "./booking-notes"
import { useStaffPresentation, statusUiStyles } from "./useStaffPresentation"
import { StaffBookingActions } from "./StaffBookingActions"

export function StaffBookingCard({
  booking,
  currentTimeMs,
  onOpenChat,
  onNotes,
  onAction,
}: {
  booking: BookingForRentalTeam
  currentTimeMs: number
  onOpenChat: (bookingId: string) => void
  onNotes: (booking: BookingForRentalTeam) => void
  onAction: (booking: BookingForRentalTeam, status: BookingStatus) => void
}) {
  const { t, dateFnsLocale, getItemTitle, getItemTypeIcon, getStatusBadge } = useStaffPresentation()
  const bookingStatusStyle =
    statusUiStyles[booking.status] || statusUiStyles[BookingStatus.REQUESTED]
  const borderColorClass = bookingStatusStyle.colors.split(" ")[0]
  const headerBgClass = `${borderColorClass} bg-muted/20 dark:bg-muted/40`
  const latestNotePreview = getLatestNotePreview(booking.notes)

  return (
    <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
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
            <span>{booking.user?.email || t("common.unknown", { defaultValue: "N/A" })}</span>
          </div>
          {typeof booking.item?.totalQuantity === "number" && booking.item.totalQuantity > 1 && (
            <div className="flex items-center text-xs text-muted-foreground">
              <Package2 className="h-3.5 w-3.5 mr-2 shrink-0" />
              <span>
                {t("myBookings.quantityLabel", { defaultValue: "Quantity" })}: {booking.quantity}
              </span>
            </div>
          )}
          {latestNotePreview && (
            <div className="mt-3 rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-card-foreground">
                {t("rentalDashboard.latestNoteLabel", {
                  defaultValue: "Latest note",
                })}
              </div>
              <p className="mt-1 leading-relaxed">{latestNotePreview}</p>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center text-muted-foreground">
            <CalendarDays className="h-4 w-4 mr-2 shrink-0" />
            <span>
              {formatInBerlin(booking.startDate, "PPp", {
                locale: dateFnsLocale,
              })}
            </span>
          </div>
          <div className="flex items-center text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 mr-2 shrink-0" />
            <span>
              {t("rentalDashboard.to", { defaultValue: "to" })}{" "}
              {formatInBerlin(
                booking.endDate,
                isSameDay(booking.startDate, booking.endDate, berlinContext) ? "p" : "PPp",
                { locale: dateFnsLocale },
              )}
            </span>
          </div>
          {booking.assignedTo && (
            <div className="text-xs text-muted-foreground pt-1 flex items-center">
              <UserIconLucide className="h-3.5 w-3.5 mr-1.5 opacity-80" />
              {t("myBookings.assignedTo")}: {booking.assignedTo.name || booking.assignedTo.email}
            </div>
          )}{" "}
        </div>
        <div className="md:text-right print:hidden">
          <div className="flex w-full flex-col gap-2">
            <Button
              size="default"
              variant="default"
              className="w-full booking-chat-btn"
              onClick={() => onOpenChat(booking.id)}
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
              onClick={() => onNotes(booking)}
            >
              <StickyNote className="mr-1.5 h-4 w-4" />
              {t("rentalDashboard.notesButton", { defaultValue: "View/Add Notes" })}
            </Button>
          </div>
          <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
            <StaffBookingActions
              booking={booking}
              currentTimeMs={currentTimeMs}
              onAction={onAction}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
