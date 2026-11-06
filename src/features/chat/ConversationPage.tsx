"use client"
import { useRouter } from "next/navigation"
import ChatDialog from "@/components/ChatDialog"
import { useCurrentAccount } from "@/features/identity/client"

export default function ConversationPage({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const { user } = useCurrentAccount()
  return (
    <ChatDialog
      key={(user?.id ?? "guest") + ":" + bookingId}
      open
      bookingId={bookingId}
      itemTitle={null}
      onOpenChange={(open) => {
        if (!open) router.push(user?.role === "USER" ? "/bookings" : "/staff")
      }}
    />
  )
}
