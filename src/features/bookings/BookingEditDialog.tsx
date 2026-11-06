"use client"

import { startOfDay } from "date-fns"
import { formatInBerlin as format, toBerlinDate } from "@/lib/berlin-time"
import { Calendar as CalendarIcon, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import TimeSelect from "@/components/TimeSelect"
import { Spinner } from "@/components/ui/spinner"
import { BookingStatus } from "@prisma/client"
import type { MyBookingsController } from "./useMyBookings"
import { useBookingPresentation } from "./useBookingPresentation"
import { isSameDay, differenceInCalendarDays } from "./booking-policy"

export function BookingEditDialog({ model }: { model: MyBookingsController }) {
  const {
    selectedBooking,
    showEditDialog,
    setShowEditDialog,
    editDateRange,
    setEditDateRange,
    editStartTime,
    setEditStartTime,
    editEndTime,
    setEditEndTime,
    editNotes,
    setEditNotes,
    editError,
    isSubmitting,
    handleUpdateBooking,
  } = model
  const { t, dateFnsLocale, getItemTitle } = useBookingPresentation()
  return (
    <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("myBookings.editDialogTitle")}</DialogTitle>
          <DialogDescription>
            {selectedBooking?.status === BookingStatus.ACCEPTED
              ? t("myBookings.editAcceptedWarning", {
                  defaultValue:
                    "Note: Editing an accepted booking will revert its status to 'Requested' for re-approval.",
                })
              : t("myBookings.editDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        {selectedBooking && (
          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {editError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t("errors.title")}</AlertTitle>
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="edit-date-popover">{t("bookingForm.selectDateRangeLabel")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="edit-date-popover"
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editDateRange?.from && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editDateRange?.from ? (
                      editDateRange.to ? (
                        `${format(editDateRange.from, "PPP", { locale: dateFnsLocale })} - ${format(editDateRange.to, "PPP", { locale: dateFnsLocale })}`
                      ) : (
                        format(editDateRange.from, "PPP", { locale: dateFnsLocale })
                      )
                    ) : (
                      <span>{t("bookingForm.selectDateRangeLabel")}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={editDateRange}
                    onSelect={(range) =>
                      setEditDateRange(
                        range
                          ? {
                              from: range.from ? toBerlinDate(range.from) : undefined,
                              to: range.to ? toBerlinDate(range.to) : undefined,
                            }
                          : undefined,
                      )
                    }
                    autoFocus
                    disabled={(date) =>
                      startOfDay(toBerlinDate(date)) < startOfDay(toBerlinDate()) ||
                      (!!editDateRange?.from &&
                        differenceInCalendarDays(date, editDateRange.from) > 1 &&
                        !isSameDay(date, editDateRange.from))
                    }
                    numberOfMonths={1}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TimeSelect
                value={editStartTime}
                onChange={setEditStartTime}
                label={t("bookingForm.startTimeLabel")}
                disabled={!editDateRange?.from}
              />
              <TimeSelect
                value={editEndTime}
                onChange={setEditEndTime}
                label={t("bookingForm.endTimeLabel")}
                disabled={!editDateRange?.from}
                otherSelectedTime={editStartTime}
                isEndTimeSelector={true}
                shouldFilterTimes={
                  editDateRange?.from &&
                  (!editDateRange.to || isSameDay(editDateRange.from, editDateRange.to))
                }
              />
            </div>{" "}
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">
                {t("common.notes")} ({t("common.optional")})
              </Label>
              <Textarea
                id="edit-notes"
                placeholder={t("bookingForm.notesPlaceholder", {
                  itemType: getItemTitle(selectedBooking.item),
                })}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">{t("bookingForm.notesGuidance")}</p>
            </div>
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button onClick={handleUpdateBooking} disabled={isSubmitting}>
            {isSubmitting && <Spinner className="mr-2 size-4" />}
            {t("common.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
