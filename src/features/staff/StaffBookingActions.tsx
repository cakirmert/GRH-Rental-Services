"use client"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"
import { type BookingForRentalTeam } from "@/types/booking"
import { BookingStatus } from "@prisma/client"

export function StaffBookingActions({
  booking,
  currentTimeMs,
  onAction: handleActionClick,
}: {
  booking: BookingForRentalTeam
  currentTimeMs: number
  onAction: (booking: BookingForRentalTeam, status: BookingStatus) => void
}) {
  const { t } = useI18n()
  const buttonClass = "mt-1 h-auto min-h-10 min-w-0 flex-1 whitespace-normal py-2"
  const startDate = new Date(booking.startDate)
  const CAN_MARK_BORROWED_BEFORE_HOURS = 4
  const canMarkBorrowed =
    booking.status === BookingStatus.ACCEPTED &&
    currentTimeMs > 0 &&
    startDate.getTime() <= currentTimeMs + CAN_MARK_BORROWED_BEFORE_HOURS * 60 * 60 * 1000

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
