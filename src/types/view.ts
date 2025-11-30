// ─ src/types/view.ts ─────────────────────────────────────────

import type { AppRoute } from "@/utils/routing"

/**
 * View and navigation related types
 */

// Define the possible views in your application
export enum View {
  LIST = "list",
  BOOKING = "booking",
  MY_BOOKINGS = "myBookings",
  RENTAL_DASHBOARD = "rentalDashboard",
  ADMIN_DASHBOARD = "adminDashboard",
  ABOUT = "about",
  CONTACT = "contact",
  DEVELOPERS = "developers",
  FAQ = "faq",
  IMPRINT = "imprint",
  PRIVACY = "privacy",
  // Add other views as needed
}

export interface ViewContextType {
  view: View
  setView: (view: View, itemId?: string, highlightId?: string) => void
  currentRoute: AppRoute
}

export type NamePromptSection = "profile" | "passkeys"

// Name prompt context
export interface NamePromptContextType {
  openPrompt: (options?: { focusSection?: NamePromptSection }) => void
}
