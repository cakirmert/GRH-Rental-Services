import ProtectedPage from "@/features/shell/ProtectedPage"
import StaffPage from "@/features/staff/StaffPage"
export const metadata = { title: "Rental team · GRH Rentals" }
export default function Page() {
  return (
    <ProtectedPage role="staff">
      <StaffPage />
    </ProtectedPage>
  )
}
