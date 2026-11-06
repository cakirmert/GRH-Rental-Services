"use client"

import { Calendar } from "@/components/ui/calendar"
import TimeSelect from "@/components/TimeSelect"
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form"
import type { Locale } from "date-fns"
import { useI18n } from "@/locales/i18n"
import InteractiveTimeRangePicker from "@/components/InteractiveTimeRangePicker"
import type { BookingRequestController } from "./useBookingRequest"
import type { BookingItem } from "./types"

export function BookingDateTimeFields({
  model,
  item,
  currentLocale,
}: {
  model: BookingRequestController
  item: BookingItem
  currentLocale: Locale
}) {
  const { t } = useI18n()
  const {
    control,
    dateRange,
    startTime,
    endTime,
    formHookErrors,
    isSingleDayRange,
    shouldShowDetailedAvailability,
    disableDate,
    selectDateRange,
  } = model
  return (
    <>
      {" "}
      <FormField
        control={control}
        name="dateRange"
        render={({ field }) => (
          <FormItem className="flex flex-col items-center w-full">
            <FormControl>
              <div className="w-full text-center">
                <Calendar
                  mode="range"
                  selected={field.value} // RHF value drives the calendar
                  onSelect={selectDateRange}
                  locale={currentLocale}
                  // Pass the field.value.from to the disableDate function context
                  disabled={(day: Date) => disableDate(day, field.value?.from)}
                  autoFocus
                />
              </div>
            </FormControl>
            {/* Ensure FormMessage shows errors from Zod refine */}
            <FormMessage className="mt-2 text-center">
              {formHookErrors.dateRange?.to?.message || formHookErrors.dateRange?.message}
            </FormMessage>
          </FormItem>
        )}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 pb-8 gap-4">
        <TimeSelect
          control={control}
          name="startTime"
          label={t("bookingForm.startTimeLabel")}
          placeholder={t("timeSelect.placeholder")}
          disabled={!dateRange?.from}
          otherSelectedTime={isSingleDayRange ? endTime : null}
          isEndTimeSelector={false}
          shouldFilterTimes={isSingleDayRange}
        />
        <TimeSelect
          control={control}
          name="endTime"
          label={t("bookingForm.endTimeLabel")}
          placeholder={t("timeSelect.placeholder")}
          disabled={!dateRange?.from}
          otherSelectedTime={isSingleDayRange ? startTime : null}
          isEndTimeSelector={true}
          shouldFilterTimes={isSingleDayRange}
        />
      </div>
      {dateRange?.from && item?.id ? (
        shouldShowDetailedAvailability ? (
          <InteractiveTimeRangePicker
            control={control}
            itemId={item.id}
            dateRange={dateRange}
            totalQuantity={item.totalQuantity ?? 1}
          />
        ) : (
          <div className="h-12 flex items-center justify-center bg-muted rounded text-xs text-muted-foreground">
            {t("bookingForm.multiDayAvailabilityNotice")}
          </div>
        )
      ) : (
        <div className="h-12 flex items-center justify-center bg-muted rounded text-xs text-muted-foreground">
          {t("bookingForm.selectDateToSeeAvailability")}
        </div>
      )}
    </>
  )
}
