export type StaffView = "list" | "calendar"
export interface StaffDashboardProps {
  onGoBack: () => void
  onOpenChat: (bookingId: string) => void
  view?: StaffView
  onViewChange?: (view: StaffView) => void
}
