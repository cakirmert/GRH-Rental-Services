"use client"

import { useI18n } from "@/locales/i18n"
import type { BookingRequestController } from "./useBookingRequest"

export function BookingSummary({ model }: { model: BookingRequestController }) {
  const { t } = useI18n()
  const { handoffInfo, formNotes, formHookErrors, invalidTimeOrder } = model
  return (
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
                <div className="text-sm text-muted-foreground">{handoffInfo.startInfo}</div>
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-2 h-2 bg-secondary rounded-full mt-2 flex-shrink-0"></span>
              <div>
                <div className="font-medium">{t("bookingForm.return")}</div>
                <div className="text-sm text-muted-foreground">{handoffInfo.endInfo}</div>
              </div>
            </li>
            {formNotes && (
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 bg-muted-foreground rounded-full mt-2 flex-shrink-0"></span>
                <div>
                  <div className="font-medium">{t("bookingForm.purpose")}</div>
                  <div className="text-sm text-muted-foreground">&ldquo;{formNotes}&rdquo;</div>
                </div>
              </li>
            )}
          </ul>
        </div>
      ) : formHookErrors.dateRange?.to?.message ? (
        <div className="text-destructive text-sm font-medium">
          {formHookErrors.dateRange.to.message}
        </div>
      ) : invalidTimeOrder ? (
        <div className="text-destructive text-sm font-medium">
          {t("errors.endTimeNotAfterStart")}
        </div>
      ) : (
        <div className="text-muted-foreground italic text-sm">
          {t("bookingForm.completeFormToSeeSummary")}
        </div>
      )}
    </div>
  )
}
