"use client"

import { Textarea } from "@/components/ui/textarea"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/locales/i18n"
import type { BookingRequestController } from "./useBookingRequest"
import type { BookingItem } from "./types"
import { isRoomItem } from "./booking-request-policy"

export function BookingDetailsFields({
  model,
  item,
}: {
  model: BookingRequestController
  item: BookingItem
}) {
  const { t } = useI18n()
  const { control } = model
  return (
    <>
      {" "}
      {(item.totalQuantity ?? 1) > 1 && (
        <FormField
          control={control}
          name="quantity"
          render={({ field }) => (
            <FormItem className="floating-form-item">
              <FormLabel>{t("bookingForm.quantityLabel", { defaultValue: "Quantity" })}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={item.totalQuantity ?? 1}
                  placeholder=" "
                  value={field.value}
                  onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
      <FormField
        control={control}
        name="notes"
        render={({ field }) => (
          <FormItem className="floating-form-item">
            <FormLabel>
              {isRoomItem(item.type)
                ? t("bookingForm.notesLabelRequired")
                : t("bookingForm.notesLabel")}
            </FormLabel>
            <FormControl>
              <Textarea
                required={isRoomItem(item.type)}
                placeholder=" "
                className="resize-none pt-4" /* Add top padding to not overlap label */
                rows={3}
                {...field}
              />
            </FormControl>
            <FormDescription className="text-xs text-muted-foreground mt-1">
              {isRoomItem(item.type)
                ? t("bookingForm.notesGuidanceRequired")
                : t("bookingForm.notesGuidance")}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}
