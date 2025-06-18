// src/components/TimeSelect.tsx
"use client"

import React from "react"
import { Control, FieldValues, Path, RegisterOptions } from "react-hook-form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormField, FormControl, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { parse, isBefore } from "date-fns"
import { useI18n } from "@/locales/i18n"

interface TimeSelectPropsStandalone {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  startHour?: number
  endHour?: number
  intervalMinutes?: number
  isEndTimeSelector?: boolean
  otherSelectedTime?: string | null
  shouldFilterTimes?: boolean
  className?: string
  disabled?: boolean
}

type TimeSelectProps<TFieldValues extends FieldValues = FieldValues> =
  | ({
      control: Control<TFieldValues>
      name: Path<TFieldValues>
      rules?: RegisterOptions<TFieldValues, Path<TFieldValues>>
    } & Omit<TimeSelectPropsStandalone, "value" | "onChange">)
  | (TimeSelectPropsStandalone & { control?: undefined; name?: undefined; rules?: undefined })

const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR = 22

// The component can operate either in React Hook Form mode (when `control` is
// provided) or as a standalone controlled select. All hooks run unconditionally
// so both modes behave consistently without changing existing call sites.

const TimeSelect = <TFieldValues extends FieldValues = FieldValues>(
  props: TimeSelectProps<TFieldValues>,
) => {
  const { t } = useI18n()

  const isRHFMode = "control" in props

  const label = props.label
  const placeholder = props.placeholder
  const className = props.className

  const startHour = props.startHour ?? DEFAULT_START_HOUR
  const endHour = props.endHour ?? DEFAULT_END_HOUR
  const intervalMinutes = props.intervalMinutes ?? 15
  const isEndTimeSelector = props.isEndTimeSelector ?? false
  const otherSelectedTime = props.otherSelectedTime
  const shouldFilterTimes = props.shouldFilterTimes ?? true
  const disabled = props.disabled ?? false

  const timeOptions = React.useMemo(() => {
    const options: string[] = []
    const otherTimeDate = otherSelectedTime ? parse(otherSelectedTime, "HH:mm", new Date()) : null
    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += intervalMinutes) {
        const timeString = `${h}`.padStart(2, "0") + ":" + `${m}`.padStart(2, "0")
        const currentTimeDate = parse(timeString, "HH:mm", new Date())
        if (otherTimeDate && shouldFilterTimes) {
          if (isEndTimeSelector) {
            if (isBefore(otherTimeDate, currentTimeDate)) {
              options.push(timeString)
            }
          } else {
            if (isBefore(currentTimeDate, otherTimeDate)) {
              options.push(timeString)
            }
          }
        } else {
          options.push(timeString)
        }
      }
    }
    if (isEndTimeSelector && endHour <= 24) {
      const endBoundaryTime = `${endHour}`.padStart(2, "0") + ":00"
      if (endHour !== 24) {
        const endBoundaryDate = parse(endBoundaryTime, "HH:mm", new Date())
        if (!otherTimeDate || isBefore(otherTimeDate, endBoundaryDate)) {
          if (!options.includes(endBoundaryTime)) {
            options.push(endBoundaryTime)
          }
        }
      }
    }
    return options
  }, [startHour, endHour, intervalMinutes, otherSelectedTime, isEndTimeSelector, shouldFilterTimes])

  if (!isRHFMode) {
    const { value, onChange } = props as TimeSelectPropsStandalone
    const getDisabledMessage = () => {
      if (isEndTimeSelector && !otherSelectedTime) {
        return t("timeSelect.selectStartFirst")
      }
      return t("timeSelect.noTimes")
    }
    return (
      <div className={className}>
        <label className="block ml-1 text-sm font-medium">{label}</label>
        <Select
          onValueChange={onChange}
          value={value || ""}
          disabled={disabled || timeOptions.length === 0}
        >
          <SelectTrigger className="bg-[hsl(var(--input))] border-[hsl(var(--border))]">
            <SelectValue placeholder={placeholder || t("timeSelect.placeholder")} />
          </SelectTrigger>
          <SelectContent className="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-lg">
            {timeOptions.length > 0 ? (
              timeOptions.map((time) => (
                <SelectItem key={time} value={time}>
                  {time}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="-" disabled>
                {getDisabledMessage()}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    )
  }

  const { control, name, rules } = props

  const getDisabledMessage = () => {
    if (isEndTimeSelector && !otherSelectedTime) {
      return t("timeSelect.selectStartFirst")
    }
    return t("timeSelect.noTimes")
  }

  return (
    <FormField
      control={control}
      name={name!}
      rules={rules}
      disabled={disabled}
      render={({ field: controllerField }) => (
        <FormItem className={className}>
          <FormLabel className="ml-1">{label}</FormLabel>
          <Select
            onValueChange={controllerField.onChange}
            value={controllerField.value || ""}
            disabled={disabled || timeOptions.length === 0}
          >
            {" "}
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder || t("timeSelect.placeholder")} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {timeOptions.length > 0 ? (
                timeOptions.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="-" disabled>
                  {getDisabledMessage()}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export default TimeSelect
