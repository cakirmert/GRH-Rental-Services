"use client"

import StaffDashboardFeature from "@/features/staff/StaffDashboardFeature"
import { openLegacyBookingChat } from "@/features/bookings/legacy-chat"

export default function RentalDashboardView({ onGoBack }: { onGoBack: () => void }) {
  return <StaffDashboardFeature onGoBack={onGoBack} onOpenChat={openLegacyBookingChat} />
}
