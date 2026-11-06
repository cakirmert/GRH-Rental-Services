import ProtectedPage from "@/features/shell/ProtectedPage"
import AdminPage from "@/features/admin/AdminPage"
export const metadata = { title: "Administration · GRH Rentals" }
export default function Page() {
  return (
    <ProtectedPage role="admin">
      <AdminPage />
    </ProtectedPage>
  )
}
