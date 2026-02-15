"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { addHours, format } from "date-fns"
import { trpc } from "@/utils/trpc"
import { useToast } from "@/components/ui/use-toast"
import { useI18n } from "@/locales/i18n"
import { useCalendar } from "./calendar-provider"
import type { BlockRecurrenceFrequency } from "@/types"

const recurrenceOptions: Array<{ value: BlockRecurrenceFrequency; labelKey: string }> = [
  { value: "NONE", labelKey: "adminCalendar.block.none" },
  { value: "DAILY", labelKey: "adminCalendar.block.daily" },
  { value: "WEEKLY", labelKey: "adminCalendar.block.weekly" },
  { value: "BIWEEKLY", labelKey: "adminCalendar.block.biweekly" },
  { value: "MONTHLY", labelKey: "adminCalendar.block.monthly" },
]

const formatInputValue = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm")

interface BlockSlotDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BlockSlotDialog({ open, onOpenChange }: BlockSlotDialogProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const { selectedDate, setSelectedDate } = useCalendar()
  const utils = trpc.useUtils()

  const { data: items = [], isLoading: itemsLoading } = trpc.items.all.useQuery(undefined, {
    enabled: open,
  })

  const [itemId, setItemId] = useState<string>("")
  const [startValue, setStartValue] = useState<string>("")
  const [endValue, setEndValue] = useState<string>("")
  const [quantity, setQuantity] = useState<string>("")
  const [reason, setReason] = useState<string>("")
  const [recurrence, setRecurrence] = useState<BlockRecurrenceFrequency>("NONE")
  const [repeatUntil, setRepeatUntil] = useState<string>("")
  const [formError, setFormError] = useState<string | null>(null)

  const selectedItem = useMemo(() => items.find((item) => item.id === itemId), [items, itemId])

  const blockSlots = trpc.bookings.blockSlots.useMutation({
    onSuccess: (result) => {
      utils.bookings.getBookings.invalidate()
      utils.bookings.listForRentalTeam.invalidate()
      toast({
        title: t("adminCalendar.block.successTitle"),
        description: t("adminCalendar.block.successDescription", {
          created: result.createdCount,
          skipped: result.skippedCount,
          item: result.title ?? "",
        }),
      })
      onOpenChange(false)
    },
    onError: (error) => {
      setFormError(error.message)
    },
  })

  useEffect(() => {
    if (open) {
      const base = selectedDate ?? new Date()
      const defaultStart = formatInputValue(base)
      const defaultEnd = formatInputValue(addHours(base, 1))
      setItemId("")
      setStartValue(defaultStart)
      setEndValue(defaultEnd)
      setQuantity("")
      setReason("")
      setRecurrence("NONE")
      setRepeatUntil("")
      setFormError(null)
    } else {
      setSelectedDate(null)
    }
  }, [open, selectedDate, setSelectedDate])

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    if (!itemId) {
      setFormError(t("adminCalendar.block.errors.itemRequired"))
      return
    }
    if (!startValue || !endValue) {
      setFormError(t("adminCalendar.block.errors.startEndRequired"))
      return
    }

    const startDate = new Date(startValue)
    const endDate = new Date(endValue)
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
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
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setFormError(t("adminCalendar.block.errors.invalidQuantity"))
        return
      }
      quantityNumber = Math.floor(parsed)
    }

    let recurrencePayload:
      | {
          frequency: BlockRecurrenceFrequency
          until?: string
        }
      | undefined

    if (recurrence !== "NONE") {
      if (!repeatUntil) {
        setFormError(t("adminCalendar.block.errors.untilRequired"))
        return
      }
      const timePortion = startValue.slice(11)
      const untilDate = new Date(`${repeatUntil}T${timePortion}`)
      if (Number.isNaN(untilDate.getTime())) {
        setFormError(t("adminCalendar.block.errors.invalidUntil"))
        return
      }
      if (untilDate < startDate) {
        setFormError(t("adminCalendar.block.errors.untilBeforeStart"))
        return
      }
      recurrencePayload = {
        frequency: recurrence,
        until: untilDate.toISOString(),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adminCalendar.block.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="block-item">{t("adminCalendar.block.itemLabel")}</Label>
            <Select value={itemId} onValueChange={setItemId} disabled={itemsLoading}>
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
                    {item.titleEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedItem && (
              <p className="text-xs text-muted-foreground">
                {t("adminCalendar.block.itemQuantity", { count: selectedItem.totalQuantity })}
              </p>
            )}
          </div>

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
            <div className="space-y-2">
              <Label htmlFor="block-until">{t("adminCalendar.block.untilLabel")}</Label>
              <Input
                id="block-until"
                type="date"
                value={repeatUntil}
                onChange={(event) => setRepeatUntil(event.target.value)}
              />
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

          {formError && <p className="text-sm text-destructive">{formError}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={blockSlots.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={blockSlots.isPending}>
              {blockSlots.isPending ? t("common.saving") : t("adminCalendar.block.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
