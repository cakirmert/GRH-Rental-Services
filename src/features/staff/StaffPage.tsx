"use client"
import { useRouter } from "next/navigation"
import StaffDashboardFeature from "./StaffDashboardFeature"
import { useChat } from "@/features/chat/ChatProvider"

export default function StaffPage({ view = "list" }: { view?: "list" | "calendar" }) {
  const router = useRouter()
  const { openChat } = useChat()
  return (
    <StaffDashboardFeature
      view={view}
      onGoBack={() => router.push("/")}
      onOpenChat={openChat}
      onViewChange={(next) => router.push(next === "calendar" ? "/staff/calendar" : "/staff")}
    />
  )
}
