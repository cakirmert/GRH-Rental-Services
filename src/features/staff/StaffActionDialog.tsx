"use client"

import { Button } from "@/components/ui/button"
import { AlertCircle as AlertCircleIcon } from "lucide-react"
import { BookingStatus } from "@prisma/client"
import { Alert } from "@/components/ui/alert"
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
import { Spinner } from "@/components/ui/spinner"
import type { StaffBookingsController } from "./useStaffBookings"
import { useStaffPresentation } from "./useStaffPresentation"

export function StaffActionDialog({ model }: { model: StaffBookingsController }) {
  const {
    showActionModal,
    setShowActionModal,
    selectedBookingForAction,
    actionToConfirm,
    actionNote,
    setActionNote,
    updateStatusMutation,
    addActionNoteMutation,
    confirmAction,
  } = model
  const { t, getItemTitle, getStatusLabelForAction } = useStaffPresentation()
  return (
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
                  {t("rentalDashboard.declineNoteReminderTitle", {
                    defaultValue: "Add a decline note",
                  })}
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
              disabled={updateStatusMutation.isPending || addActionNoteMutation.isPending}
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
  )
}
