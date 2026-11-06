export type AdminView =
  "home" | "assignees" | "items" | "members" | "inactive" | "calendar" | "cancellations"
export interface AdminDashboardProps {
  onGoBack: () => void
  section?: AdminView
  onSectionChange?: (section: AdminView) => void
  requestedReviewId?: string
  onReviewInactive?: (userId: string) => void
}
