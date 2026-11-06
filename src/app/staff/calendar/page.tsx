import ProtectedPage from "@/features/shell/ProtectedPage"
import StaffPage from "@/features/staff/StaffPage"
export const metadata = { title: "Rental calendar · GRH Rentals" }
export default function Page() {
  return (
    <ProtectedPage role="staff">
      <StaffPage view="calendar" />
    </ProtectedPage>
  )
}
