import { format } from "date-fns"
import { CheckCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useI18n } from "@/locales/i18n"

interface BookingSuccessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onViewBookings: () => void
  bookingDetails: {
    id: string
    itemName: string
    date: Date
    startTime: string
    endTime: string
    notes?: string
  }
}

export function BookingSuccessDialog({
  open,
  onOpenChange,
  onViewBookings,
  bookingDetails,
}: BookingSuccessDialogProps) {
  const { id, itemName, date, startTime, endTime, notes } = bookingDetails
  const { t } = useI18n()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-success-foreground">
            {t("bookingSuccess.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/20">
            <CheckCircle className="h-6 w-6 text-success-foreground" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-foreground">
            {t("bookingSuccess.title")}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t("bookingSuccess.description", { itemName })}
          </p>
          <div className="rounded-md bg-secondary/30 p-4 mb-4 text-left">
            <p className="mb-1">
              <strong>{t("myBookings.cancelItemLabel")}</strong> {itemName}
            </p>
            <p className="mb-1">
              <strong>{t("myBookings.cancelDateLabel")}</strong> {date ? format(date, "PPP") : ""}
            </p>
            <p className="mb-1">
              <strong>{t("myBookings.cancelTimeLabel")}</strong> {startTime} - {endTime}
            </p>
            {notes && (
              <p className="mb-1">
                <strong>{t("myBookings.detailsNotesLabel")}</strong> {notes}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              Booking ID: {id || t("common.error")}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={onViewBookings}>
            {t("bookingSuccess.viewMyBookings")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
