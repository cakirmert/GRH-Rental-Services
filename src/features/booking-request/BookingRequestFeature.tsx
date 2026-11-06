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
    <div className="space-y-8 mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
