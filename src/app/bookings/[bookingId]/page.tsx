import ProtectedPage from "@/features/shell/ProtectedPage"
import BookingsPage from "@/features/bookings/BookingsPage"
export default async function Page({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params
  return (
    <ProtectedPage>
      <BookingsPage highlightId={bookingId} />
    </ProtectedPage>
  )
}
