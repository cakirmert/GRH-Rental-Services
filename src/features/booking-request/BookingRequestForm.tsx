"use client"

import { Form } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import { useI18n } from "@/locales/i18n"
import { Spinner } from "@/components/ui/spinner"
import { useAuthModal } from "@/contexts/AuthModalContext"
import type { BookingRequestController } from "./useBookingRequest"
import type { BookingRequestProps } from "./types"
import { BookingDateTimeFields } from "./BookingDateTimeFields"
import { BookingDetailsFields } from "./BookingDetailsFields"
import { BookingSummary } from "./BookingSummary"

export function BookingRequestForm({
  model,
  item,
  authStatus,
  currentLocale,
}: { model: BookingRequestController } & Pick<
  BookingRequestProps,
  "item" | "authStatus" | "currentLocale"
>) {
  const { t } = useI18n()
  const { openAuthModal } = useAuthModal()
  const { form, formError, submittingBooking, handleContinueToBooking } = model
  return (
    <div className="min-w-0 w-full space-y-6">
      {authStatus === "loading" ? (
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
      ) : authStatus === "unauthenticated" ? (
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
            className="space-y-6 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
          >
            <h2 className="text-xl font-semibold text-center border-b pb-2">
              {t("bookingForm.selectDateAndTimeTitle")}
            </h2>
            <BookingDateTimeFields model={model} item={item} currentLocale={currentLocale} />
            <BookingDetailsFields model={model} item={item} />
            {formError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t("errors.title")}</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <BookingSummary model={model} />
            <Button
              type="button"
              onClick={handleContinueToBooking}
              disabled={
                submittingBooking || authStatus !== "authenticated" || model.availabilityConflict
              }
              className="w-full"
              size="lg"
            >
              {authStatus === "authenticated" ? (
                submittingBooking ? (
                  <>
                    <Spinner className="mr-2 size-4" />
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
  )
}
