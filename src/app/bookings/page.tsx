import ProtectedPage from "@/features/shell/ProtectedPage"
import BookingsPage from "@/features/bookings/BookingsPage"
export const metadata = { title: "My bookings · GRH Rentals" }
export default function Page() {
  return (
    <ProtectedPage>
      <BookingsPage />
    </ProtectedPage>
  )
}
