import ProtectedPage from "@/features/shell/ProtectedPage"
import ConversationPage from "@/features/chat/ConversationPage"
export const metadata = { title: "Messages · GRH Rentals" }
export default async function Page({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  return (
    <ProtectedPage>
      <ConversationPage bookingId={bookingId} />
    </ProtectedPage>
  )
}
