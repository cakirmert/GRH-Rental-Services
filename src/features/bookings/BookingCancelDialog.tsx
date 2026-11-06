"use client"

import { formatInBerlin as format } from "@/lib/berlin-time"
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
import { Spinner } from "@/components/ui/spinner"
import type { MyBookingsController } from "./useMyBookings"
import { useBookingPresentation } from "./useBookingPresentation"
import { ensureDateObject } from "./booking-policy"

export function BookingCancelDialog({ model }: { model: MyBookingsController }) {
  const { selectedBooking, showCancelDialog, setShowCancelDialog, cancelBookingMutation } = model
  const { t, dateFnsLocale, getItemTitle } = useBookingPresentation()
  return (
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
              – {format(ensureDateObject(selectedBooking.endDate), "p", { locale: dateFnsLocale })}
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
            {cancelBookingMutation.isPending && <Spinner className="mr-2 size-4" />}
            {t("myBookings.confirmCancelButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
