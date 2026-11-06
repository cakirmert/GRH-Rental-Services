"use client"

import MyBookingsFeature from "@/features/bookings/MyBookingsFeature"
import type { MyBookingsFeatureProps } from "@/features/bookings/types"
import { openLegacyBookingChat } from "@/features/bookings/legacy-chat"

export default function MyBookingsComponent(props: Omit<MyBookingsFeatureProps, "onOpenChat">) {
  return <MyBookingsFeature {...props} onOpenChat={openLegacyBookingChat} />
}
