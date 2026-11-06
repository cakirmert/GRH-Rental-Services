"use client"

import { Button } from "@/components/ui/button"
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

export function StaffNotesDialog({ model }: { model: StaffBookingsController }) {
  const {
    noteDialogBooking,
    closeNotesDialog,
    noteEntries,
    noteEditorValue,
    setNoteEditorValue,
    addNoteMutation,
    handleNoteSubmit,
  } = model
  const { t, getItemTitle } = useStaffPresentation()
  return (
    <Dialog
      open={Boolean(noteDialogBooking)}
      onOpenChange={(open) => {
        if (!open) {
          closeNotesDialog()
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("rentalDashboard.notesDialogTitle", { defaultValue: "Booking Notes" })}
          </DialogTitle>
          <DialogDescription>
            {t("rentalDashboard.notesDialogDescription", {
              defaultValue: "Share internal updates with your rental team.",
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {noteDialogBooking && (
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("rentalDashboard.notesForBooking", { defaultValue: "Booking" })}
              </Label>
              <div className="mt-1 text-sm font-semibold text-card-foreground">
                {getItemTitle(noteDialogBooking.item)}
              </div>
              <div className="text-xs text-muted-foreground">
                #{noteDialogBooking.id.substring(0, 8)}
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs font-medium text-muted-foreground">
              {t("rentalDashboard.existingNotes", { defaultValue: "Existing notes" })}
            </Label>
            {noteEntries.length ? (
              <div className="mt-2 space-y-3 max-h-64 overflow-y-auto pr-1">
                {noteEntries.map((entry, index) => (
                  <div
                    key={`${noteDialogBooking?.id ?? "note"}-${index}`}
                    className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 p-3 text-sm whitespace-pre-wrap leading-relaxed"
                  >
                    {entry}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("rentalDashboard.noNotes", { defaultValue: "No notes yet." })}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="rental-add-note" className="text-xs font-medium text-muted-foreground">
              {t("rentalDashboard.addNoteLabel", { defaultValue: "Add a note" })}
            </Label>
            <Textarea
              id="rental-add-note"
              value={noteEditorValue}
              onChange={(event) => setNoteEditorValue(event.target.value)}
              placeholder={t("rentalDashboard.addNotePlaceholder", {
                defaultValue: "Write details the rental team should remember...",
              })}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="outline"
              onClick={closeNotesDialog}
              disabled={addNoteMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button
            onClick={handleNoteSubmit}
            disabled={addNoteMutation.isPending || !noteEditorValue.trim()}
          >
            {addNoteMutation.isPending && <Spinner className="mr-2 size-4" />}
            {t("rentalDashboard.addNoteSubmit", { defaultValue: "Save Note" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
