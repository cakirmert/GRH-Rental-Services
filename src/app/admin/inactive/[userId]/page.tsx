import ProtectedPage from "@/features/shell/ProtectedPage"
import AdminPage from "@/features/admin/AdminPage"
export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  return (
    <ProtectedPage role="admin">
      <AdminPage section="inactive" reviewId={userId} />
    </ProtectedPage>
  )
}
