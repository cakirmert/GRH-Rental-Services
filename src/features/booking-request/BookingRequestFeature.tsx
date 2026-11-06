"use client"

import { BookingRulesDialog } from "@/components/BookingRulesDialog"
import type { BookingRequestProps } from "./types"
import { useBookingRequest } from "./useBookingRequest"
import { BookingItemSummary } from "./BookingItemSummary"
import { BookingRequestForm } from "./BookingRequestForm"

/** A draft belongs to this account and item, and survives locale changes only. */
export default function BookingRequestFeature(props: BookingRequestProps) {
  return (
    <BookingRequest key={`${props.session?.user?.id ?? "guest"}:${props.item.id}`} {...props} />
  )
}
function BookingRequest(props: BookingRequestProps) {
  const model = useBookingRequest(props)
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <BookingItemSummary item={props.item} onGoBack={props.onGoBack} />
        <BookingRequestForm
          model={model}
          item={props.item}
          authStatus={props.authStatus}
          currentLocale={props.currentLocale}
        />
      </div>
      <BookingRulesDialog
        open={model.showRules}
        onOpenChange={model.setShowRules}
        onConfirm={model.handleSubmit(model.executeBooking)}
        isSubmitting={model.submittingBooking}
      />
    </div>
  )
}
