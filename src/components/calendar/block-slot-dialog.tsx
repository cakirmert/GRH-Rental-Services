"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { addHours } from "date-fns"
import { trpc } from "@/utils/trpc"
import { useToast } from "@/components/ui/use-toast"
import { useI18n } from "@/locales/i18n"
import { useCalendar } from "./calendar-provider"
import type { BlockRecurrenceFrequency } from "@/types"
import { formatBerlinDateTime, parseBerlinDateTime, toBerlinDate } from "@/lib/berlin-time"

const recurrenceOptions: Array<{ value: BlockRecurrenceFrequency; labelKey: string }> = [
  { value: "NONE", labelKey: "adminCalendar.block.none" },
  { value: "DAILY", labelKey: "adminCalendar.block.daily" },
  { value: "WEEKLY", labelKey: "adminCalendar.block.weekly" },
  { value: "BIWEEKLY", labelKey: "adminCalendar.block.biweekly" },
  { value: "MONTHLY", labelKey: "adminCalendar.block.monthly" },
]

interface BlockSlotDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BlockSlotDialog({ open, onOpenChange }: BlockSlotDialogProps) {
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const { selectedDate, setSelectedDate } = useCalendar()
  const utils = trpc.useUtils()

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setSelectedDate(null)
    onOpenChange(nextOpen)
  }

  const {
    data: items = [],
    isLoading: itemsLoading,
    isError: itemsError,
    refetch: retryItems,
  } = trpc.bookings.blockableItems.useQuery(undefined, {
    enabled: open,
    staleTime: 0,
  })

  const [itemId, setItemId] = useState<string>("")
  const [startValue, setStartValue] = useState<string>("")
  const [endValue, setEndValue] = useState<string>("")
  const [quantity, setQuantity] = useState<string>("")
  const [reason, setReason] = useState<string>("")
  const [recurrence, setRecurrence] = useState<BlockRecurrenceFrequency>("NONE")
  const [repeatUntil, setRepeatUntil] = useState<string>("")
  const [noEndDate, setNoEndDate] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)

  const selectedItem = useMemo(() => items.find((item) => item.id === itemId), [items, itemId])

  const blockSlots = trpc.bookings.blockSlots.useMutation({
    onSuccess: (result) => {
      utils.bookings.getBookings.invalidate()
      utils.bookings.listForRentalTeam.invalidate()
      utils.bookings.availability.invalidate()
      toast({
        title: t("adminCalendar.block.successTitle"),
        description: t(
          result.indefinite
            ? "adminCalendar.block.indefiniteSuccess"
            : "adminCalendar.block.successDescription",
          {
            item: result.title ?? "",
          },
        ),
      })
      handleOpenChange(false)
    },
    onError: (error) => {
      setFormError(error.message)
    },
  })

  useEffect(() => {
    if (open) {
      const base = selectedDate ?? toBerlinDate()
      const defaultStart = formatBerlinDateTime(base)
      const defaultEnd = formatBerlinDateTime(addHours(base, 1))
      setItemId("")
      setStartValue(defaultStart)
      setEndValue(defaultEnd)
      setQuantity("")
      setReason("")
      setRecurrence("NONE")
      setRepeatUntil("")
      setNoEndDate(true)
      setFormError(null)
    }
  }, [open, selectedDate])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!selectedItem || itemsError) {
      setFormError(t("adminCalendar.block.errors.itemRequired"))
      return
    }
    if (!startValue || !endValue) {
      setFormError(t("adminCalendar.block.errors.startEndRequired"))
      return
    }

    let startDate: Date
    let endDate: Date
    try {
      startDate = parseBerlinDateTime(startValue)
      endDate = parseBerlinDateTime(endValue)
    } catch {
      setFormError(t("adminCalendar.block.errors.invalidDate"))
      return
    }
    if (endDate <= startDate) {
      setFormError(t("adminCalendar.block.errors.endBeforeStart"))
      return
    }

    let quantityNumber: number | undefined
    if (quantity.trim().length > 0) {
      const parsed = Number(quantity)
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > selectedItem.totalQuantity) {
        setFormError(t("adminCalendar.block.errors.invalidQuantity"))
        return
      }
      quantityNumber = parsed
    }

    let recurrencePayload:
      | {
          frequency: BlockRecurrenceFrequency
          until?: string
        }
      | undefined

    if (recurrence !== "NONE") {
      recurrencePayload = { frequency: recurrence }
      if (!noEndDate) {
        if (!repeatUntil) {
          setFormError(t("adminCalendar.block.errors.untilRequired"))
          return
        }
        let untilDate: Date
        try {
          untilDate = parseBerlinDateTime(`${repeatUntil}T23:59`)
        } catch {
          setFormError(t("adminCalendar.block.errors.invalidUntil"))
          return
        }
        if (untilDate < startDate) {
          setFormError(t("adminCalendar.block.errors.untilBeforeStart"))
          return
        }
        recurrencePayload.until = untilDate.toISOString()
      }
    }

    blockSlots.mutate({
      itemId,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      quantity: quantityNumber,
      reason: reason.trim() ? reason.trim() : undefined,
      recurrence: recurrencePayload,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("adminCalendar.block.title")}</DialogTitle>
          <DialogDescription>{t("adminCalendar.block.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="block-item">{t("adminCalendar.block.itemLabel")}</Label>
            <Select
              value={itemId}
              onValueChange={setItemId}
              disabled={itemsLoading || itemsError || !items.length || blockSlots.isPending}
            >
              <SelectTrigger id="block-item">
                <SelectValue
                  placeholder={
                    itemsLoading ? t("common.loading") : t("adminCalendar.block.itemPlaceholder")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {(locale === "de" && item.titleDe) || item.titleEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {itemsError ? (
              <div role="alert" className="space-y-1 text-sm text-destructive">
                <p>{t("adminCalendar.block.itemsError")}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void retryItems()}>
                  {t("calendar.retry")}
                </Button>
              </div>
            ) : !itemsLoading && !items.length ? (
              <p className="text-sm text-muted-foreground">{t("adminCalendar.block.noItems")}</p>
            ) : null}
            {selectedItem && (
              <p className="text-xs text-muted-foreground">
                {t("adminCalendar.block.itemQuantity", { count: selectedItem.totalQuantity })}
              </p>
            )}
          </div>

          <p className="text-xs font-medium text-muted-foreground">
            {t("adminCalendar.block.timeZone")}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="block-start">{t("adminCalendar.block.startLabel")}</Label>
              <Input
                id="block-start"
                type="datetime-local"
                value={startValue}
                onChange={(event) => setStartValue(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-end">{t("adminCalendar.block.endLabel")}</Label>
              <Input
                id="block-end"
                type="datetime-local"
                value={endValue}
                min={startValue}
                onChange={(event) => setEndValue(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="block-quantity">{t("adminCalendar.block.quantityLabel")}</Label>
              <Input
                id="block-quantity"
                type="number"
                min={1}
                max={selectedItem?.totalQuantity}
                step={1}
                value={quantity}
                placeholder={t("adminCalendar.block.quantityPlaceholder")}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-recurrence">{t("adminCalendar.block.recurrenceLabel")}</Label>
              <Select
                value={recurrence}
                onValueChange={(value) => setRecurrence(value as BlockRecurrenceFrequency)}
              >
                <SelectTrigger id="block-recurrence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recurrenceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {recurrence !== "NONE" && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="block-no-end"
                  checked={noEndDate}
                  onCheckedChange={(checked) => setNoEndDate(checked === true)}
                />
                <Label htmlFor="block-no-end">{t("adminCalendar.block.noEndDate")}</Label>
              </div>
              {noEndDate ? (
                <p className="text-xs text-muted-foreground">
                  {t("adminCalendar.block.noEndHint")}
                </p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="block-until">{t("adminCalendar.block.untilLabel")}</Label>
                  <Input
                    id="block-until"
                    type="date"
                    value={repeatUntil}
                    min={startValue.slice(0, 10)}
                    onChange={(event) => setRepeatUntil(event.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="block-reason">{t("adminCalendar.block.reasonLabel")}</Label>
            <Textarea
              id="block-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("adminCalendar.block.reasonPlaceholder")}
            />
          </div>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={blockSlots.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={blockSlots.isPending || itemsLoading || itemsError || !items.length}
            >
              {blockSlots.isPending ? t("common.saving") : t("adminCalendar.block.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
