"use client"

import MyBookingsFeature from "@/features/bookings/MyBookingsFeature"
import type { MyBookingsFeatureProps } from "@/features/bookings/types"
import { openLegacyBookingChat } from "@/features/bookings/legacy-chat"
import { useEffect, useState } from "react"

export default function MyBookingsComponent(props: Omit<MyBookingsFeatureProps, "onOpenChat">) {
  const [legacyHighlight, setLegacyHighlight] = useState<string | null>(null)
  useEffect(() => {
    const id = localStorage.getItem("grh-highlight-booking-id")
    if (id) {
      setLegacyHighlight(id)
      localStorage.removeItem("grh-highlight-booking-id")
    }
  }, [])
  return <MyBookingsFeature {...props} highlightBookingId={props.highlightBookingId ?? legacyHighlight} onOpenChat={openLegacyBookingChat} />
}
