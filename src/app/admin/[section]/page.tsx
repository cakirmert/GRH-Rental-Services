import { notFound } from "next/navigation"
import ProtectedPage from "@/features/shell/ProtectedPage"
import AdminPage from "@/features/admin/AdminPage"
import type { AdminView } from "@/features/admin/types"
const sections = ["assignees", "items", "members", "inactive", "calendar", "cancellations"]
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.includes(section)) notFound()
  return (
    <ProtectedPage role="admin">
      <AdminPage section={section as AdminView} />
    </ProtectedPage>
  )
}
