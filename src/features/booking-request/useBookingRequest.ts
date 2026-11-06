"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { isBefore, startOfDay } from "date-fns"
import { combineBerlinDateAndTime, formatInBerlin as format, toBerlinDate } from "@/lib/berlin-time"
import { useI18n } from "@/locales/i18n"
import { toast } from "@/components/ui/use-toast"
import { type DateRange } from "react-day-picker"
import { trpc } from "@/utils/trpc"
import type { BookingRequestProps } from "./types"
import {
  type BookingFormValues,
  baseBookingFormSchema,
  createBookingFormSchema,
  DEFAULT_MAX_RANGE_DAYS,
  RENTAL_MAX_RANGE_DAYS,
  emptyBookingValues,
  isRoomItem,
  selectBookingRange,
  isSameDay,
  differenceInCalendarDays,
  isToday,
} from "./booking-request-policy"

export function useBookingRequest(props: BookingRequestProps) {
  const { t } = useI18n()
  const { item, session, authStatus, currentLocale, onBookingSuccess } = props
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const userRole = session?.user?.role
  const isRentalMember = userRole === "RENTAL" || userRole === "ADMIN"
  const maxSelectableRangeDays = isRentalMember ? RENTAL_MAX_RANGE_DAYS : DEFAULT_MAX_RANGE_DAYS

  const rangeErrorMessage = useMemo(() => {
    if (!Number.isFinite(maxSelectableRangeDays)) return ""
    return t("errors.rangeTooLong", { days: maxSelectableRangeDays + 1 })
  }, [maxSelectableRangeDays, t])

  const bookingSchema = useMemo(() => {
    const isRoom = isRoomItem(item.type)
    if (!Number.isFinite(maxSelectableRangeDays)) {
      return isRoom ? createBookingFormSchema(Infinity, "", isRoom) : baseBookingFormSchema
    }
    const message = rangeErrorMessage || t("errors.checkForm")
    return createBookingFormSchema(maxSelectableRangeDays, message, isRoom)
  }, [maxSelectableRangeDays, rangeErrorMessage, t, item.type])

  const formResolver = useMemo(() => zodResolver(bookingSchema), [bookingSchema])

  const form = useForm<BookingFormValues>({
    resolver: formResolver,
    defaultValues: emptyBookingValues,
  })
  const {
    handleSubmit,
    control,
    trigger,
    formState: { errors: formHookErrors },
  } = form

  const [formError, setFormError] = useState<string | null>(null)
  const [submittingBooking, setSubmittingBooking] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [availabilityConflict, setAvailabilityConflict] = useState(false)
  const [dateRange, startTime, endTime, quantity, formNotes] = useWatch({
    control,
    name: ["dateRange", "startTime", "endTime", "quantity", "notes"],
  })

  const minSelectableDateOverall = startOfDay(toBerlinDate())

  // Dynamic date disabling logic for the calendar
  const disableDate = (day: Date, selectedFromDate?: Date): boolean => {
    if (isBefore(startOfDay(toBerlinDate(day)), minSelectableDateOverall)) {
      return true // Disable past dates
    }
    if (selectedFromDate) {
      // If a 'from' date is selected and we are evaluating other dates
      if (
        Number.isFinite(maxSelectableRangeDays) &&
        differenceInCalendarDays(day, selectedFromDate) > maxSelectableRangeDays
      ) {
        return true
      }
    }
    return false
  }

  const combineDateTime = useCallback(
    (d: Date | undefined, tStr: string) => {
      if (!d) throw new Error(t("errors.selectDate"))
      if (!tStr) throw new Error(t("errors.selectTime"))
      return combineBerlinDateAndTime(d, tStr)
    },
    [t],
  )
  const bookingMutation = trpc.bookings.create.useMutation({
    onSuccess(data) {
      if (!active.current) return
      form.reset(emptyBookingValues)

      onBookingSuccess(data.id)
      toast({
        title: t("bookingSuccess.title"),
        description: t("bookingSuccess.description", { itemName: item.name }),
      })
    },
    onError(err) {
      if (!active.current) return
      setFormError(err.message || t("errors.bookingFailed"))
      toast({
        title: t("errors.title"),
        description: err.message || t("errors.unexpected"),
        variant: "destructive",
      })
    },
    onSettled() {
      if (!active.current) return
      setSubmittingBooking(false)
    },
  })

  const validateBookingForm = (): boolean => {
    setFormError(null)
    if (!dateRange?.from) {
      setFormError(t("errors.selectDateRange"))
      return false
    }
    if (!startTime || !endTime) {
      setFormError(t("errors.selectTime"))
      return false
    }
    if (quantity < 1 || quantity > (item.totalQuantity ?? 1)) {
      setFormError(t("errors.invalidQuantity", { defaultValue: "Invalid quantity" }))
      return false
    }
    try {
      const startDT = combineDateTime(dateRange.from, startTime)
      const effEndDate = dateRange.to || dateRange.from
      const endDT = combineDateTime(effEndDate, endTime)
      const rangeDifference = differenceInCalendarDays(effEndDate, dateRange.from)
      if (Number.isFinite(maxSelectableRangeDays) && rangeDifference > maxSelectableRangeDays) {
        setFormError(
          rangeErrorMessage || t("errors.rangeTooLong", { days: maxSelectableRangeDays + 1 }),
        )
        return false
      }
      const now = toBerlinDate()
      if (isToday(dateRange.from)) {
        const limit = new Date(now.getTime() + 12 * 60 * 60 * 1000)
        if (isBefore(startDT, limit)) {
          setFormError(t("errors.startTimeTooSoon", { hours: 12 }))
          return false
        }
      } else if (isBefore(startDT, now) && !isToday(startDT)) {
        setFormError(t("errors.pastTime"))
        return false
      }
      if (!isBefore(startDT, endDT)) {
        setFormError(t("errors.endTimeNotAfterStart"))
        return false
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setFormError(msg || t("errors.invalidDateTime"))
      return false
    }
    return true
  }

  const handleContinueToBooking = async () => {
    const ok = await trigger() // Trigger RHF + Zod validation
    if (!active.current) return
    if (!ok) {
      // The render's formState can still contain the previous validation result.
      const result = bookingSchema.safeParse(form.getValues())
      setFormError(
        result.success
          ? t("errors.checkForm")
          : result.error.issues[0]?.message || t("errors.checkForm"),
      )
      return
    }
    if (validateBookingForm()) {
      // Run additional custom validations if any
      setShowRules(true)
    }
  }

  const executeBooking = async (values: BookingFormValues) => {
    // RHF validation is asynchronous; the account/item may have changed while
    // it was running. Never dispatch a former draft with a new current session.
    if (!active.current) return
    if (authStatus !== "authenticated") {
      setFormError(t("errors.userNotFound"))
      setShowRules(false)
      return
    }
    // `values` are Zod-validated. Custom validation check again for safety.
    if (!validateBookingForm()) {
      setShowRules(false)
      return
    }
    setSubmittingBooking(true)
    setShowRules(false)
    const startDT = combineDateTime(values.dateRange!.from, values.startTime)
    const effEndDate = values.dateRange!.to || values.dateRange!.from
    const endDT = combineDateTime(effEndDate, values.endTime)
    bookingMutation.mutate({
      itemId: item.id,
      quantity: values.quantity,
      start: startDT.toISOString(),
      end: endDT.toISOString(),
      notes: values.notes ?? undefined,
    })
  }

  const selectedRangeSpanDays =
    dateRange?.from && dateRange?.to ? differenceInCalendarDays(dateRange.to, dateRange.from) : 0
  const isSingleDayRange = !!dateRange?.from && (!dateRange?.to || selectedRangeSpanDays === 0)
  const isTwoDayRange = !!dateRange?.from && !!dateRange?.to && selectedRangeSpanDays === 1
  const shouldShowDetailedAvailability = isSingleDayRange || isTwoDayRange
  const handoffInfo = useMemo(() => {
    if (!dateRange?.from || !startTime || !endTime) {
      return null
    }

    try {
      const startDT = combineDateTime(dateRange.from, startTime)
      const effEndDate = dateRange.to || dateRange.from
      const endDT = combineDateTime(effEndDate, endTime)
      const rangeDifference = differenceInCalendarDays(effEndDate, dateRange.from)
      if (Number.isFinite(maxSelectableRangeDays) && rangeDifference > maxSelectableRangeDays) {
        return null
      }

      if (!isBefore(startDT, endDT)) {
        return null
      }

      if (formHookErrors.dateRange?.to?.message) {
        return null
      }

      const fmtStartDate = format(startDT, "PPP", { locale: currentLocale })
      const fmtStartTime = format(startDT, "p", { locale: currentLocale })
      const fmtEndTime = format(endDT, "p", { locale: currentLocale })

      const multiDay = dateRange.to && !isSameDay(dateRange.from, dateRange.to)
      const fmtEndDate = multiDay ? format(endDT, "PPP", { locale: currentLocale }) : null

      // Determine handoff type
      let handoffType: string
      if (item.type === "room") {
        handoffType = t("bookingForm.keyHandoff")
      } else if (item.type === "game") {
        handoffType = t("bookingForm.gameHandoff")
      } else {
        handoffType = t("bookingForm.itemHandoff", { itemName: t(item.name) })
      }

      return {
        handoffType,
        startInfo: `${fmtStartDate} ${t("bookingForm.at")} ${fmtStartTime}`,
        endInfo: multiDay
          ? `${fmtEndDate} ${t("bookingForm.at")} ${fmtEndTime}`
          : `${fmtStartDate} ${t("bookingForm.at")} ${fmtEndTime}`,
        quantity: quantity > 1 ? quantity : null,
      }
    } catch {
      return null
    }
  }, [
    dateRange,
    startTime,
    endTime,
    quantity,
    item.type,
    item.name,
    currentLocale,
    t,
    formHookErrors.dateRange,
    combineDateTime,
    maxSelectableRangeDays,
  ])
  const invalidTimeOrder = useMemo(() => {
    if (!dateRange?.from || !startTime || !endTime) return false
    try {
      return !isBefore(
        combineDateTime(dateRange.from, startTime),
        combineDateTime(dateRange.to || dateRange.from, endTime),
      )
    } catch {
      // Invalid/nonexistent Berlin times are reported during validation, without
      // throwing while rendering the summary.
      return false
    }
  }, [dateRange, startTime, endTime, combineDateTime])

  const selectDateRange = (range: DateRange | undefined, clicked: Date) => {
    setAvailabilityConflict(false)
    const next = selectBookingRange(
      form.getValues("dateRange"),
      range,
      clicked,
      maxSelectableRangeDays,
    )
    form.setValue("dateRange", next, { shouldDirty: true, shouldValidate: true })
    form.resetField("startTime")
    form.resetField("endTime")
  }
  return {
    form,
    control,
    handleSubmit,
    formHookErrors,
    formError,
    submittingBooking,
    showRules,
    setShowRules,
    availabilityConflict,
    setAvailabilityConflict,
    dateRange,
    startTime,
    endTime,
    formNotes,
    isSingleDayRange,
    shouldShowDetailedAvailability,
    handoffInfo,
    invalidTimeOrder,
    disableDate,
    selectDateRange,
    handleContinueToBooking,
    executeBooking,
  }
}
export type BookingRequestController = ReturnType<typeof useBookingRequest>
