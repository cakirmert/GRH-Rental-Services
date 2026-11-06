"use client"

import BookingRequestFeature from "@/features/booking-request/BookingRequestFeature"
import type { BookingRequestProps } from "@/features/booking-request/types"
import type { IdentitySession } from "@/features/identity/types"

export type BookingFormViewProps = Omit<BookingRequestProps, "session"> & {
  session: IdentitySession | null
}

/** @deprecated The App Router owns navigation; retained until legacy callers migrate. */
export function setNavigatingBetweenViews(_value: boolean) {}
export default function BookingFormView(props: BookingFormViewProps) {
  return <BookingRequestFeature {...props} />
}
