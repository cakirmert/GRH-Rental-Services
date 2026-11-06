"use client"
import { useRouter } from "next/navigation"
import AdminDashboardFeature from "./AdminDashboardFeature"
import type { AdminView } from "./types"

export default function AdminPage({
  section = "home",
  reviewId,
}: {
  section?: AdminView
  reviewId?: string
}) {
  const router = useRouter()
  return (
    <AdminDashboardFeature
      section={section}
      requestedReviewId={reviewId}
      onGoBack={() => router.push("/")}
      onSectionChange={(next) => router.push(next === "home" ? "/admin" : "/admin/" + next)}
      onReviewInactive={(id) => router.push("/admin/inactive/" + encodeURIComponent(id))}
    />
  )
}
