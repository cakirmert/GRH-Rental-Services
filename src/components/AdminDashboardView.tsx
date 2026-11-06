"use client"

import AdminDashboardFeature from "@/features/admin/AdminDashboardFeature"

export type { AdminView } from "@/features/admin/types"
export default function AdminDashboardView({ onGoBack }: { onGoBack: () => void }) {
  return <AdminDashboardFeature onGoBack={onGoBack} />
}
