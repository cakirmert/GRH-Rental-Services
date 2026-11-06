"use client"

import { formatInBerlin as format } from "@/lib/berlin-time"
import { Mail } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import type { MyBookingsController } from "./useMyBookings"
import { useBookingPresentation } from "./useBookingPresentation"
import { ensureDateObject, isSameDay, getStatusBadgeVariant } from "./booking-policy"

export function BookingDetailsDialog({ model }: { model: MyBookingsController }) {
  const { selectedBooking, showDetails, setShowDetails } = model
  const { t, dateFnsLocale, formatStatusDisplay, getItemTitle, getItemTypeIcon } =
    useBookingPresentation()
  return (
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
  )
}
