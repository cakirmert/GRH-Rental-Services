// ─ src/types/routing.ts ─────────────────────────────────────

/**
 * Application route types for navigation
 */

export type AppRoute =
  | { view: "list" }
  | { view: "booking"; itemId: string }
  | { view: "my-bookings"; highlightId?: string }
  | { view: "rental-dashboard" }
  | { view: "admin-dashboard" }
  | { view: "about" }
  | { view: "contact" }
  | { view: "developers" }
  | { view: "faq" }
  | { view: "imprint" }
  | { view: "privacy" }
