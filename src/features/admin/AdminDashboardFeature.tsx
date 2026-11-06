"use client"

import { useCurrentAccount } from "@/features/identity/client"
import NotAuthorized from "@/components/NotAuthorized"
import { Spinner } from "@/components/ui/spinner"
import type { AdminDashboardProps } from "./types"
import { AdminHome } from "./AdminHome"
import { AdminWorkspace } from "./AdminWorkspace"
import { useAdminNavigation } from "./useAdminNavigation"

export default function AdminDashboardFeature(props: AdminDashboardProps) {
  const { user, status } = useCurrentAccount()
  if (status === "loading") {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (status !== "authenticated" || !user || user.role !== "ADMIN") {
    return <NotAuthorized onGoBack={props.onGoBack} requiredRole="ADMIN" />
  }
  return <AdminDashboard key={user.id} actorId={user.id} {...props} />
}
function AdminDashboard({
  actorId,
  onGoBack,
  ...options
}: AdminDashboardProps & { actorId: string }) {
  const navigation = useAdminNavigation(options)
  return navigation.currentSection === "home" ? (
    <AdminHome onGoBack={onGoBack} onSectionChange={navigation.navigate} />
  ) : (
    <AdminWorkspace
      actorId={actorId}
      onGoBack={onGoBack}
      currentViewOrTab={navigation.currentSection}
      requestedReviewId={navigation.requestedReviewId}
      handleNavigateToSection={navigation.navigate}
      onReviewInactive={navigation.reviewInactive}
    />
  )
}
