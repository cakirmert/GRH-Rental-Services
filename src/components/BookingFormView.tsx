// src/components/BookingFormView.tsx
"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Image from "next/image"
import { Calendar } from "@/components/ui/calendar"
import TimeSelect from "@/components/TimeSelect"
import { Textarea } from "@/components/ui/textarea"
import { getOptimizedImageUrls } from "@/lib/imageUtils"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Loader2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react"
import {
  format,
  isBefore,
  startOfDay,
  isToday,
  isSameDay,
  addDays, // For max range
  differenceInCalendarDays, // For max range
} from "date-fns"
import type { Locale } from "date-fns"
import { useI18n } from "@/locales/i18n"
import { toast } from "@/components/ui/use-toast"
import { BookingRulesDialog } from "@/components/BookingRulesDialog"
import type { Session } from "next-auth"
import { type DateRange, type Modifiers } from "react-day-picker" // Use Modifiers instead of DayModifiers
import { trpc } from "@/utils/trpc"
import InteractiveTimeRangePicker from "@/components/InteractiveTimeRangePicker"
import { useAuthModal } from "@/contexts/AuthModalContext"

import { useView, View } from "@/contexts/ViewContext" // Import View type
// ... (interfaces and schema remain the same) ...
/* ---------- types ---------- */
interface Item {
  id: string
  name: string
  type: string
  capacity?: number
  players?: string
  images?: string[]
  description?: string
  longDescriptionKey?: string
  rules?: string | string[]
  totalQuantity?: number
}

interface BookingFormViewProps {
  item: Item
  session: Session | null
  authStatus: "authenticated" | "unauthenticated" | "loading"
  currentLocale: Locale
  onGoBack: () => void
  onBookingSuccess: (bookingId: string) => void
  onLoginRequest: (email: string) => Promise<{ error?: string } | undefined>
}

/* ---------- zod schema ---------- */
const bookingFormSchema = z.object({
  dateRange: z
    .object({
      from: z.date(),
      to: z.date().optional(),
    })
    .refine(
      (data) => {
        // Custom validation for max 2-day range
        if (data && data.from && data.to) {
          return differenceInCalendarDays(data.to, data.from) <= 1
        }
        return true // Allow if 'to' is not set (single day) or if dateRange is undefined
      },
      {
        message: "Booking range cannot exceed 2 days.", // This message can be localized
        path: ["to"], // Associate error with the 'to' date if range is too long
      },
    )
    .optional(),
  startTime: z.string().min(1, { message: "Start time is required." }),
  endTime: z.string().min(1, { message: "End time is required." }),
  quantity: z.number().min(1),
  notes: z.string().optional(),
})
type BookingFormValues = z.infer<typeof bookingFormSchema>

// Global state for image positions to persist across component unmounts
const globalImageState = new Map<string, number>()

// Global state for form data to persist across component unmounts
const globalFormState = new Map<string, Partial<BookingFormValues>>()

// Track navigation type to distinguish between view changes and page refreshes
let isNavigatingBetweenViews = false

export function setNavigatingBetweenViews(value: boolean) {
  isNavigatingBetweenViews = value
  if (typeof window !== "undefined") {
    if (value) {
      sessionStorage.setItem("grh-navigation-type", "view-change")
    } else {
      sessionStorage.removeItem("grh-navigation-type")
    }
  }
}

function isViewChange(): boolean {
  if (isNavigatingBetweenViews) return true

  if (typeof window !== "undefined") {
    return sessionStorage.getItem("grh-navigation-type") === "view-change"
  }

  return false
}

// Clear navigation flag on page load (not on view change)
if (typeof window !== "undefined") {
  // This will run on module load, which happens on page refresh
  const handlePageLoad = () => {
    sessionStorage.removeItem("grh-navigation-type")
    isNavigatingBetweenViews = false

    // Clear all stored form data on page refresh to ensure clean slate
    // This prevents the calendar from being stuck with previously selected dates
    const formKeys = Object.keys(sessionStorage).filter((key) => key.startsWith("grh-form-"))
    formKeys.forEach((key) => sessionStorage.removeItem(key))
    globalFormState.clear()
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handlePageLoad)
  } else {
    handlePageLoad()
  }
}

function getStoredImageIndex(itemId: string): number {
  // Check global state first
  if (globalImageState.has(itemId)) {
    return globalImageState.get(itemId)!
  }

  // Check sessionStorage as fallback
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem(`grh-image-${itemId}`)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed)) {
        globalImageState.set(itemId, parsed)
        return parsed
      }
    }
  }

  return 0
}

function setStoredImageIndex(itemId: string, index: number): void {
  globalImageState.set(itemId, index)
  if (typeof window !== "undefined") {
    sessionStorage.setItem(`grh-image-${itemId}`, index.toString())
  }
}

function getDefaultFormValues(itemId: string): Partial<BookingFormValues> {
  // Only return stored values if this is a view change (not page refresh)
  if (isViewChange()) {
    return getStoredFormData(itemId)
  }

  // For page refresh, return clean default values to avoid persistence issues
  // The date selection should not persist across page refreshes to prevent
  // the calendar from being stuck in a selected state that can't be cleared
  return {
    dateRange: undefined,
    startTime: "",
    endTime: "",
    quantity: 1,
    notes: "",
  }
}

function getStoredFormData(itemId: string): Partial<BookingFormValues> {
  // Check global state first
  if (globalFormState.has(itemId)) {
    return globalFormState.get(itemId)!
  }

  // Check sessionStorage as fallback
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem(`grh-form-${itemId}`)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Convert date strings back to Date objects
        if (parsed.dateRange?.from) {
          parsed.dateRange.from = new Date(parsed.dateRange.from)
        }
        if (parsed.dateRange?.to) {
          parsed.dateRange.to = new Date(parsed.dateRange.to)
        }
        globalFormState.set(itemId, parsed)
        return parsed
      } catch {
        // Ignore parsing errors
      }
    }
  }

  return { dateRange: undefined, startTime: "", endTime: "", quantity: 1, notes: "" }
}

function setStoredFormData(itemId: string, formData: Partial<BookingFormValues>): void {
  globalFormState.set(itemId, formData)
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(`grh-form-${itemId}`, JSON.stringify(formData))
    } catch {
      // Ignore storage errors
    }
  }
}

/* =================================================================== */
/*                         Component                                   */
/* =================================================================== */
function BookingFormView(props: BookingFormViewProps) {
  const { t } = useI18n()
  const { item, authStatus, currentLocale, onBookingSuccess } = props

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, []) // Runs once after initial client render

  // Scroll to top when component is mounted, item.id changes, or authStatus changes
  useEffect(() => {
    if (mounted) {
      // Only scroll if component is client-side mounted and ready
      window.scrollTo(0, 0)
    }
  }, [mounted, item.id, authStatus]) // Re-run if any of these change

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: getDefaultFormValues(item.id),
    // mode: "onChange", // Consider if you want validation on every change for dateRange
  })
  const {
    watch,
    handleSubmit,
    control,
    trigger,
    resetField,
    formState: { errors: formHookErrors, dirtyFields },
  } = form

  const [formError, setFormError] = useState<string | null>(null)
  const [submittingBooking, setSubmittingBooking] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showLoginPrompt] = useState(authStatus === "unauthenticated")
  const [currentImage, setCurrentImage] = useState(() => getStoredImageIndex(item.id))
  const [imageLoading, setImageLoading] = useState<boolean>(false)
  const [imageError, setImageError] = useState<boolean>(false)
  const [imageFit, setImageFit] = useState<"cover" | "contain">("cover")
  const [loadingImageSrc, setLoadingImageSrc] = useState<string>("")
  const [thumbnailLoadingStates, setThumbnailLoadingStates] = useState<Set<number>>(new Set())
  const thumbnailsRef = useRef<HTMLDivElement | null>(null) // Ensure form is initialized with stored data on mount (only for view changes, not refresh)
  useEffect(() => {
    // Only restore form data if this is a view change (not a page refresh)
    if (isViewChange()) {
      const storedFormData = getStoredFormData(item.id)
      if (
        storedFormData.dateRange ||
        storedFormData.startTime ||
        storedFormData.endTime ||
        storedFormData.notes
      ) {
        form.reset(storedFormData)
      }
    }
    // Clear the navigation flag after use
    setNavigatingBetweenViews(false)
  }, [form, item.id])
  // Handle form preservation across language changes
  // Instead of using refs and timeouts, we'll initialize the form with the latest stored data
  // This is more reliable than trying to reset the form after locale changes
  const { locale: i18nLocale } = useI18n()

  // Re-initialize form when locale changes by getting fresh stored data
  useEffect(() => {
    const storedFormData = getStoredFormData(item.id)
    const hasStoredData =
      storedFormData.dateRange ||
      storedFormData.startTime ||
      storedFormData.endTime ||
      storedFormData.notes

    if (hasStoredData) {
      // Reset form with stored data whenever locale changes
      form.reset(storedFormData)
    }
  }, [form, item.id, i18nLocale])

  // Persist current image to global state and sessionStorage whenever it changes
  useEffect(() => {
    setStoredImageIndex(item.id, currentImage)
  }, [currentImage, item.id])
  // Cleanup on unmount - but don't clear global state as it should persist
  useEffect(() => {
    return () => {
      // Don't clear global state, only sessionStorage cleanup if needed
      // The global state should persist across component mounts
    }
  }, [])
  // Memoize images array to prevent unnecessary re-renders
  // Create a stable reference by stringifying the array content
  const imageUrlsJson = JSON.stringify(item.images || [])
  const images = useMemo(() => {
    return getOptimizedImageUrls(item.images || [])
  }, [imageUrlsJson]) // eslint-disable-line react-hooks/exhaustive-deps
  
  // Reset current image when item changes and load stored image for new item
  useEffect(() => {
    const storedImage = getStoredImageIndex(item.id)
    setCurrentImage(storedImage)
  }, [item.id])
  
  // Handle image loading state when current image source changes
  // Simplified approach: let Next.js Image component handle loading states
  useEffect(() => {
    if (images.length > 0 && images[currentImage]) {
      const newImageSrc = images[currentImage]
      if (newImageSrc !== loadingImageSrc) {
        setLoadingImageSrc(newImageSrc)
        // Set initial loading state, but let the Image component's onLoad/onError handle the rest
        setImageLoading(true)
        setImageError(false)
      }
    }
  }, [currentImage, images, loadingImageSrc])

  // Ensure currentImage is within bounds when images change
  useEffect(() => {
    if (currentImage >= images.length && images.length > 0) {
      setCurrentImage(0)
    }
  }, [currentImage, images.length])
  // Memoize navigation functions to prevent unnecessary re-renders
  const goToPreviousImage = useCallback(() => {
    setCurrentImage((prev) => (prev - 1 + images.length) % images.length)
  }, [images.length])

  const goToNextImage = useCallback(() => {
    setCurrentImage((prev) => (prev + 1) % images.length)
  }, [images.length])
  const goToImage = useCallback(
    (index: number) => {
      if (index >= 0 && index < images.length) {
        setCurrentImage(index)
      }
    },
    [images.length],
  )  // Handle thumbnail loading state - simplified approach
  const handleThumbnailLoadStart = useCallback((index: number) => {
    setThumbnailLoadingStates((prev) => new Set([...prev, index]))
  }, [])

  const handleThumbnailLoadEnd = useCallback((index: number) => {
    setThumbnailLoadingStates((prev) => {
      const newSet = new Set([...prev])
      newSet.delete(index)
      return newSet
    })
  }, [])

  // Initialize thumbnail loading states when images change
  useEffect(() => {
    // Clear all loading states when images array changes
    setThumbnailLoadingStates(new Set())
  }, [imageUrlsJson]) // Use the stable reference

  const dateRange = watch("dateRange") // RHF source of truth
  const startTime = watch("startTime")
  const endTime = watch("endTime")
  const quantity = watch("quantity")
  const formNotes = watch("notes")

  // Persist form data to global state when it changes
  useEffect(() => {
    const formData = {
      dateRange,
      startTime,
      endTime,
      quantity,
      notes: formNotes,
    }

    // Update global storage for persistence across view changes and locale changes
    setStoredFormData(item.id, formData)
  }, [dateRange, startTime, endTime, quantity, formNotes, item.id])

  useEffect(() => {
    if (dirtyFields.dateRange || dateRange === undefined) {
      resetField("startTime")
      resetField("endTime")
    }
  }, [dateRange, resetField, dirtyFields.dateRange])

  useEffect(() => {
    if (thumbnailsRef.current) {
      const active = thumbnailsRef.current.children[currentImage] as HTMLElement | undefined
      active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
    }
  }, [currentImage])

  const minSelectableDateOverall = startOfDay(new Date())

  // Dynamic date disabling logic for the calendar
  const disableDate = (day: Date, modifiers: Modifiers, selectedFromDate?: Date): boolean => {
    if (isBefore(day, minSelectableDateOverall)) {
      return true // Disable past dates
    }
    if (selectedFromDate && !modifiers.selected) {
      // If a 'from' date is selected and we are evaluating other dates
      // Disable days that are more than 1 day after the selected 'from' date
      if (differenceInCalendarDays(day, selectedFromDate) > 1) {
        return true
      }
    }
    return false
  }

  const combineDateTime = useCallback(
    (d: Date | undefined, tStr: string) => {
      if (!d) throw new Error(t("errors.selectDate"))
      if (!tStr) throw new Error(t("errors.selectTime"))
      const [h, m] = tStr.split(":").map(Number)
      if (isNaN(h) || isNaN(m)) throw new Error(t("errors.invalidTimeFormat"))
      const dt = new Date(d)
      dt.setHours(h, m, 0, 0)
      return dt
    },
    [t],
  )
  const bookingMutation = trpc.bookings.create.useMutation({
    onSuccess(data) {
      // Clear form data after successful booking
      globalFormState.delete(item.id)
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`grh-form-${item.id}`)
      }

      onBookingSuccess(data.id)
      toast({
        title: t("bookingSuccess.title"),
        description: t("bookingSuccess.description", { itemName: item.name }),
      })
    },
    onError(err) {
      setFormError(err.message || t("errors.bookingFailed"))
      toast({
        title: t("errors.title"),
        description: err.message || t("errors.unexpected"),
        variant: "destructive",
      })
    },
    onSettled() {
      setSubmittingBooking(false)
    },
  })

  const validateBookingForm = (): boolean => {
    setFormError(null)
    if (Object.keys(formHookErrors).length > 0) {
      const firstErrorMessage = Object.values(formHookErrors)[0]?.message
      setFormError(
        typeof firstErrorMessage === "string" ? firstErrorMessage : t("errors.checkForm"),
      )
      // Special check for dateRange refine error
      if (formHookErrors.dateRange?.to?.message) {
        setFormError(formHookErrors.dateRange.to.message)
      }
      return false
    }
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
      const now = new Date()
      if (isToday(dateRange.from)) {
        const limit = new Date()
        limit.setHours(now.getHours() + 12, now.getMinutes(), 0, 0)
        if (isBefore(startDT, limit)) {
          setFormError(t("errors.startTimeTooSoon", { hours: 12 }))
          return false
        }
      } else if (isBefore(startDT, now) && !isToday(startDT)) {
        setFormError(t("errors.pastTime"))
        return false
      }
      if (format(startDT, "yyyy-MM-dd") === format(endDT, "yyyy-MM-dd")) {
        if (!isBefore(startDT, endDT)) {
          setFormError(t("errors.endTimeNotAfterStart"))
          return false
        }
      }
      // Zod refine now handles max duration at form level
      // if (differenceInHours(endDT, startDT) > 48) {
      //   setFormError(t("errorMaxBookingDuration", { hours: 48 }));
      //   return false;
      // }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setFormError(msg || t("errors.invalidDateTime"))
      return false
    }
    return true
  }

  const handleContinueToBooking = async () => {
    const ok = await trigger() // Trigger RHF + Zod validation
    if (!ok) {
      const firstErrorMessage = Object.values(formHookErrors).find((err) => err?.message)?.message
      let specificError =
        typeof firstErrorMessage === "string" ? firstErrorMessage : t("errors.checkForm")
      if (formHookErrors.dateRange?.to?.message) {
        // Prioritize Zod refine message
        specificError = formHookErrors.dateRange.to.message
      }
      setFormError(specificError)
      return
    }
    if (validateBookingForm()) {
      // Run additional custom validations if any
      setShowRules(true)
    }
  }

  const executeBooking = async (values: BookingFormValues) => {
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

  const isSingleDayForTimeSelect =
    dateRange?.from != null && (dateRange.to == null || isSameDay(dateRange.from, dateRange.to)) // Use isSameDay
  const translatedDescription = useMemo(() => {
    if (item.longDescriptionKey) {
      return t(`itemDescriptions.${item.longDescriptionKey}`)
    }
    if (item.description) {
      return t(item.description)
    }
    return t("itemCard.noDescriptionAvailable")
  }, [item.longDescriptionKey, item.description, t])
  const handoffInfo = useMemo(() => {
    if (!dateRange?.from || !startTime || !endTime) {
      return null
    }

    try {
      const startDT = combineDateTime(dateRange.from, startTime)
      const effEndDate = dateRange.to || dateRange.from
      const endDT = combineDateTime(effEndDate, endTime)

      if (
        format(startDT, "yyyy-MM-dd") === format(endDT, "yyyy-MM-dd") &&
        !isBefore(startDT, endDT)
      ) {
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
    formHookErrors.dateRange?.to?.message,
    combineDateTime,
  ])
  const SELECTED_ITEM_KEY = "grh-selected-item-id"

  const { setView } = useView()
  const { openAuthModal } = useAuthModal()
  const goBack = useCallback(() => {
    localStorage.removeItem(SELECTED_ITEM_KEY)
    setView(View.LIST)
  }, [setView])

  return (
    <div className="space-y-8 mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ">
        {/* Item Details Column */}
        <div className="space-y-6 md:sticky md:top-24 md:self-start">
          {!mounted ? (
            <>
              <Skeleton className="h-10 w-3/4 rounded-md md:h-12" /> {/* Title */}
              <div className="space-y-2 mt-4">
                {" "}
                {/* Description */}
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-5/6 rounded-md" />
              </div>
              <Skeleton className="aspect-video w-full mt-4 rounded-lg" /> {/* Image Area */}
              <div className="flex flex-wrap items-center gap-2 text-sm mt-4">
                {" "}
                {/* Badges */}
                <Skeleton className="h-7 w-24 rounded-md py-1 px-2" />
                <Skeleton className="h-7 w-20 rounded-md py-1 px-2" />
              </div>
              {/* Skeleton for Rules (conditionally rendered based on item.rules) */}
              <div className="p-4 border rounded-lg bg-muted/50 mt-6">
                {" "}
                {/* Mimic rules container */}
                <Skeleton className="h-5 w-1/2 mb-3 rounded-md" /> {/* Rules Title */}
                <div className="space-y-1.5 pl-5">
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-11/12 rounded-md" />
                </div>
              </div>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={goBack} className="flex ml-auto gap-2">
                <ChevronLeft className="h-4 w-4" />
                {t("common.back")}
              </Button>
              <h1 className="text-3xl lg:text-5xl font-bold mb-1">{item.name}</h1>
              <p className="text-base lg:text-lg leading-relaxed whitespace-pre-line text-foreground/80 dark:text-muted-foreground mb-4">
                {translatedDescription}
              </p>
              {images.length > 0 && (
                <div className="space-y-2">
                  <div
                    className="relative w-full overflow-hidden rounded-lg shadow aspect-video select-none group"
                    onTouchStart={(e) => {
                      const target = e.currentTarget
                      const touchStart = e.targetTouches[0].clientX
                      let touchEnd: number | null = null

                      const handleTouchMove = (moveEvent: TouchEvent) => {
                        touchEnd = moveEvent.targetTouches[0].clientX
                      }

                      const handleTouchEnd = () => {
                        if (touchStart && touchEnd) {
                          const distance = touchStart - touchEnd
                          const isLeftSwipe = distance > 50
                          const isRightSwipe = distance < -50

                          if (isLeftSwipe && images.length > 1) {
                            goToNextImage()
                          }
                          if (isRightSwipe && images.length > 1) {
                            goToPreviousImage()
                          }
                        }

                        if (target) {
                          target.removeEventListener("touchmove", handleTouchMove)
                          target.removeEventListener("touchend", handleTouchEnd)
                        }
                      }

                      if (target) {
                        target.addEventListener("touchmove", handleTouchMove)
                        target.addEventListener("touchend", handleTouchEnd)
                      }
                    }}
                  >
                    {imageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-card">
                        <Skeleton className="w-full h-full" />
                      </div>
                    )}
                    <Image
                      src={images[currentImage]}
                      alt={`${item.name} ${currentImage + 1}`}
                      fill
                      className={`object-${imageFit} select-none pointer-events-none`}
                      priority={true}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      draggable={false}
                      onLoad={(e) => {
                        setImageLoading(false)
                        setImageError(false)
                        const { naturalWidth, naturalHeight } = e.currentTarget
                        if (naturalHeight > naturalWidth) {
                          setImageFit("contain")
                        } else {
                          setImageFit("cover")
                        }
                      }}
                      onError={() => {
                        setImageLoading(false)
                        setImageError(true)
                      }}
                      style={{
                        opacity: imageLoading ? 0 : 1,
                        transition: "opacity 0.2s ease-in-out",
                      }}
                    />
                    {imageError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-card text-muted-foreground">
                        <div className="text-center">
                          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                          <p className="text-sm">Failed to load image</p>
                        </div>
                      </div>
                    )}
                    {images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={goToPreviousImage}
                          className="absolute left-0 top-0 w-16 h-full flex items-center justify-center bg-gradient-to-r from-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 hover:from-black/30"
                        >
                          <div className="bg-white/90 hover:bg-white p-2 rounded-full shadow-lg transition-all duration-200">
                            <ChevronLeft className="h-5 w-5 text-gray-700" />
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={goToNextImage}
                          className="absolute right-0 top-0 w-16 h-full flex items-center justify-center bg-gradient-to-l from-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 hover:from-black/30"
                        >
                          <div className="bg-white/90 hover:bg-white p-2 rounded-full shadow-lg transition-all duration-200">
                            <ChevronRight className="h-5 w-5 text-gray-700" />
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                  {images.length > 1 && (
                    <div ref={thumbnailsRef} className="flex gap-2 overflow-x-auto">
                      <div className="flex-shrink-0 w-0.1" />
                      {images.map((img, idx) => (
                        <button
                          key={`${item.id}-${img}-${idx}`}
                          type="button"
                          onClick={() => goToImage(idx)}
                          className={`relative h-16 w-16 my-2 flex-shrink-0 rounded-md overflow-hidden cursor-pointer transition-all duration-200 ${
                            idx === currentImage
                              ? "ring-2 ring-primary shadow-md"
                              : "hover:ring-1 hover:ring-border"
                          }`}
                        >
                          {thumbnailLoadingStates.has(idx) && idx !== currentImage && (
                            <div className="absolute inset-0 flex items-center justify-center bg-card rounded-md">
                              <Skeleton className="w-full h-full rounded-md" />
                            </div>
                          )}
                          <Image
                            src={img}
                            alt={`${item.name} thumb ${idx + 1}`}
                            fill
                            className="object-cover rounded-md select-none pointer-events-none"
                            sizes="64px"
                            draggable={false}
                            onLoadingComplete={() => handleThumbnailLoadEnd(idx)}
                            onError={() => handleThumbnailLoadEnd(idx)}
                            onLoadStart={() => handleThumbnailLoadStart(idx)}
                            style={{
                              opacity:
                                thumbnailLoadingStates.has(idx) && idx !== currentImage ? 0 : 1,
                              transition: "opacity 0.15s ease-in-out",
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-base mt-2">
                {item.capacity && (
                  <Badge variant="secondary" className="py-1 px-2">
                    <Users className="h-4 w-4 mr-1" />
                    {t("common.capacity")}: {item.capacity}
                  </Badge>
                )}
                {item.players && (
                  <Badge variant="secondary" className="py-1 px-2">
                    <Users className="h-4 w-4 mr-1" />
                    {t("common.players")}: {item.players}
                  </Badge>
                )}
              </div>
              {item.rules && (
                <div className="p-4 border rounded-lg bg-muted/50 text-foreground">
                  <h3 className="font-semibold mb-2">
                    {t("bookingForm.specialRulesTitle", { itemName: item.name })}
                  </h3>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                    {Array.isArray(item.rules) ? (
                      item.rules.map((rule, idx) => <li key={idx}>{rule}</li>)
                    ) : (
                      <li>{item.rules}</li>
                    )}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        {/* Booking Form Column */}
        <div className="space-y-6 w-full max-w-md ml-auto min-h-[600px]">
          {/* Added min-h-[600px] for layout stability */}
          {!mounted || authStatus === "loading" ? (
            // Skeleton loading state to prevent layout shifts and hydration mismatches
            <Card className="bg-muted/50 shadow-sm">
              <CardHeader>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ) : showLoginPrompt && authStatus === "unauthenticated" ? (
            <Card className="bg-muted/50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">{t("auth.loginRequiredTitle")}</CardTitle>
                <CardDescription>{t("auth.loginRequiredDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" className="w-full mt-2" onClick={() => openAuthModal()}>
                  {t("header.signInButton")}
                </Button>
              </CardContent>
            </Card>
          ) : authStatus === "authenticated" ? (
            <Form {...form}>
              <form
                onSubmit={(e) => e.preventDefault()}
                className="space-y-6 p-4 border rounded-lg shadow-sm bg-card"
              >
                <h2 className="text-xl font-semibold text-center border-b pb-2">
                  {t("bookingForm.selectDateAndTimeTitle")}
                </h2>
                <FormField
                  control={control}
                  name="dateRange"
                  render={({ field }) => (
                    <FormItem className="flex flex-col items-center w-full">
                      <FormControl>
                        <div className="w-full mr-4 text-center">
                          <Calendar
                            mode="range"
                            selected={field.value} // RHF value drives the calendar
                            onSelect={(
                              currentSelectedRange: DateRange | undefined, // The range RDP *would* set
                              selectedDay: Date, // The day that was clicked
                            ) => {
                              let newRHFValue: BookingFormValues["dateRange"]

                              if (
                                field.value?.from &&
                                !field.value.to &&
                                isSameDay(selectedDay, field.value.from)
                              ) {
                                newRHFValue = undefined
                              } else if (
                                field.value?.from &&
                                field.value.to &&
                                (isSameDay(selectedDay, field.value.from) ||
                                  isSameDay(selectedDay, field.value.to)) &&
                                currentSelectedRange?.from &&
                                currentSelectedRange.to &&
                                isSameDay(currentSelectedRange.from, currentSelectedRange.to) &&
                                isSameDay(currentSelectedRange.from, selectedDay)
                              ) {
                                // Scenario 2: A full range [from, to] is selected. User clicks either 'from' or 'to'.
                                // RDP might try to set a new range starting and ending on the clicked day.
                                // We interpret this as "clear the selection".
                                newRHFValue = undefined
                              } else if (currentSelectedRange?.from) {
                                // Scenario 3: A new valid range or single day is formed by RDP.
                                // Respect RDP's new range, but cap 'to' if it exceeds max duration.
                                const from = currentSelectedRange.from
                                let to = currentSelectedRange.to

                                if (from && to && differenceInCalendarDays(to, from) > 1) {
                                  to = addDays(from, 1) // Cap 'to' to be one day after 'from'
                                }
                                newRHFValue = { from, to }
                              } else {
                                // Scenario 4: RDP suggests clearing the range (e.g., currentSelectedRange is undefined).
                                newRHFValue = undefined
                              }

                              field.onChange(newRHFValue)
                              trigger("dateRange") // Manually trigger validation for the dateRange field
                            }}
                            locale={currentLocale}
                            // Pass the field.value.from to the disableDate function context
                            disabled={(day: Date) => disableDate(day, {}, field.value?.from)}
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
                    otherSelectedTime={endTime}
                    isEndTimeSelector={false}
                    shouldFilterTimes={isSingleDayForTimeSelect}
                  />
                  <TimeSelect
                    control={control}
                    name="endTime"
                    label={t("bookingForm.endTimeLabel")}
                    placeholder={t("timeSelect.placeholder")}
                    disabled={!dateRange?.from}
                    otherSelectedTime={startTime}
                    isEndTimeSelector={true}
                    shouldFilterTimes={isSingleDayForTimeSelect}
                  />
                </div>
                {dateRange?.from && item?.id ? (
                  <InteractiveTimeRangePicker
                    control={control}
                    itemId={item.id}
                    dateRange={dateRange}
                    totalQuantity={item.totalQuantity ?? 1}
                  />
                ) : (
                  <div className="h-12 flex items-center justify-center bg-muted rounded text-xs text-muted-foreground">
                    {t("bookingForm.selectDateToSeeAvailability")}
                  </div>
                )}
                {(item.totalQuantity ?? 1) > 1 && (
                  <FormField
                    control={control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="ml-1">
                          {t("bookingForm.quantityLabel", { defaultValue: "Quantity" })}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={item.totalQuantity ?? 1}
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
                    <FormItem>
                      <FormLabel className="ml-1">{t("bookingForm.notesLabel")}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t("bookingForm.notesPlaceholder", {
                            itemType: t(item.type || "item"),
                          })}
                          className="resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-muted-foreground">
                        {t("bookingForm.notesGuidance")}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {formError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t("errors.title")}</AlertTitle>
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <div className="p-4 border rounded-lg bg-muted/50 text-foreground">
                  {handoffInfo ? (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        {t("bookingForm.handoffDetails")}
                      </h3>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></span>
                          <div>
                            <div className="font-medium">
                              {handoffInfo.quantity && handoffInfo.quantity > 1
                                ? `${handoffInfo.quantity}× ${handoffInfo.handoffType}`
                                : handoffInfo.handoffType}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {handoffInfo.startInfo}
                            </div>
                          </div>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></span>
                          <div>
                            <div className="font-medium">{t("bookingForm.return")}</div>
                            <div className="text-sm text-muted-foreground">
                              {handoffInfo.endInfo}
                            </div>
                          </div>
                        </li>
                        {formNotes && (
                          <li className="flex items-start gap-2">
                            <span className="w-2 h-2 bg-muted-foreground rounded-full mt-2 flex-shrink-0"></span>
                            <div>
                              <div className="font-medium">{t("bookingForm.purpose")}</div>
                              <div className="text-sm text-muted-foreground">
                                &ldquo;{formNotes}&rdquo;
                              </div>
                            </div>
                          </li>
                        )}
                      </ul>
                    </div>
                  ) : formHookErrors.dateRange?.to?.message ? (
                    <div className="text-destructive text-sm font-medium">
                      {formHookErrors.dateRange.to.message}
                    </div>
                  ) : dateRange?.from &&
                    startTime &&
                    endTime &&
                    format(combineDateTime(dateRange.from, startTime), "yyyy-MM-dd") ===
                      format(
                        combineDateTime(dateRange.to || dateRange.from, endTime),
                        "yyyy-MM-dd",
                      ) &&
                    !isBefore(
                      combineDateTime(dateRange.from, startTime),
                      combineDateTime(dateRange.to || dateRange.from, endTime),
                    ) ? (
                    <div className="text-destructive text-sm font-medium">
                      {t("errors.endTimeNotAfterStart")}
                    </div>
                  ) : (
                    <div className="text-muted-foreground italic text-sm">
                      {t("bookingForm.completeFormToSeeSummary")}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={handleContinueToBooking}
                  disabled={submittingBooking || authStatus !== "authenticated"}
                  className="w-full"
                  size="lg"
                >
                  {authStatus === "authenticated" ? (
                    submittingBooking ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("common.submitting")}
                      </>
                    ) : (
                      t("bookingForm.continueToBookingButton")
                    )
                  ) : (
                    t("auth.loginToBook")
                  )}
                </Button>{" "}
              </form>
            </Form>
          ) : null}
        </div>
      </div>

      <BookingRulesDialog
        open={showRules}
        onOpenChange={setShowRules}
        onConfirm={handleSubmit(executeBooking)}
        isSubmitting={submittingBooking}
      />
    </div>
  )
}

export default BookingFormView
