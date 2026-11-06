"use client"

import { formatInBerlin as format } from "@/lib/berlin-time"
import {
  Calendar as CalendarIcon,
  Clock,
  Mail,
  Edit,
  X,
  Package2,
  MessageSquare,
} from "lucide-react"
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
import { cn } from "@/lib/utils"
import { BookingStatus } from "@prisma/client"
import type { Ref } from "react"
import type { BookingFromList } from "./types"
import { useBookingPresentation } from "./useBookingPresentation"
import {
  ensureDateObject,
  isSameDay,
  getStatusBadgeVariant,
  canUserEditOrCancel,
} from "./booking-policy"

export function BookingCard({
  booking,
  highlightRef,
  onDetails,
  onEdit,
  onCancel,
  onOpenChat,
  onGoBackToList,
}: {
  booking: BookingFromList
  highlightRef?: Ref<HTMLDivElement>
  onDetails: (booking: BookingFromList) => void
  onEdit: (booking: BookingFromList) => void
  onCancel: (booking: BookingFromList) => void
  onOpenChat: (bookingId: string) => void
  onGoBackToList: () => void
}) {
  const { t, dateFnsLocale, formatStatusDisplay, getItemTitle, getItemTypeIcon } =
    useBookingPresentation()
  return (
    <Card
      ref={highlightRef}
      className={cn(
        "overflow-hidden transition-all hover:shadow-lg group",
        booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.DECLINED
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
            {!isSameDay(ensureDateObject(booking.startDate), ensureDateObject(booking.endDate)) &&
              ` (${t("myBookings.nextDayIndicator", { defaultValue: "next day" })})`}
          </span>
        </div>{" "}
        {(booking.item.totalQuantity ?? 1) > 1 && (
          <div className="flex items-center text-muted-foreground">
            <Package2 className="h-4 w-4 mr-2.5 flex-shrink-0" />
            <span>
              {t("myBookings.quantityLabel", { defaultValue: "Quantity" })}: {booking.quantity}
            </span>
          </div>
        )}
        {booking.assignedTo &&
          (booking.status === BookingStatus.ACCEPTED ||
            booking.status === BookingStatus.BORROWED) && (
            /* ... AssignedTo display ... */ <div className="text-xs text-muted-foreground pt-1.5 flex items-center">
              <Mail className="h-3.5 w-3.5 mr-1.5 opacity-80" />
              {t("myBookings.assignedTo")}: {booking.assignedTo.name || booking.assignedTo.email}
            </div>
          )}
      </CardContent>
      <CardFooter className="p-3 flex flex-col sm:flex-row justify-between items-center gap-2 bg-muted/20 border-t group-hover:bg-muted/40 transition-colors">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDetails(booking)}
          className="min-h-10 text-xs h-auto px-3 w-full sm:w-auto"
        >
          {t("myBookings.viewDetailsButton")}
        </Button>
        <div className="grid min-w-0 w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            className="col-span-2 min-w-0 max-w-full min-h-10 h-auto whitespace-normal px-3 text-xs"
            onClick={() => onOpenChat(booking.id)}
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />{" "}
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {booking.assignedTo
                ? t("myBookings.chatWithAssigned", {
                    defaultValue: "Chat with {name}",
                    name: booking.assignedTo.name || booking.assignedTo.email || "Team",
                  })
                : t("Chat.MyBookings", { defaultValue: "Chat" })}
            </span>
          </Button>
          {canUserEditOrCancel(booking.status) && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10 h-auto whitespace-normal px-3 text-xs"
                onClick={() => onEdit(booking)}
              >
                <Edit className="h-3.5 w-3.5 mr-1.5" />
                {t("myBookings.editButton")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="min-h-10 h-auto whitespace-normal px-3 text-xs"
                onClick={() => onCancel(booking)}
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
              className="col-span-2 min-h-10 h-auto whitespace-normal text-xs px-3 w-full sm:w-auto"
            >
              {t("myBookings.bookAgainButton")}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
