"use client"
import { useRouter } from "next/navigation"
import MyBookingsFeature from "./MyBookingsFeature"
import { useChat } from "@/features/chat/ChatProvider"

export default function BookingsPage({ highlightId }: { highlightId?: string }) {
  const router = useRouter()
  const { openChat } = useChat()
  return (
    <MyBookingsFeature
      highlightBookingId={highlightId}
      onGoBackToList={() => router.push("/")}
      onOpenChat={openChat}
    />
  )
}
