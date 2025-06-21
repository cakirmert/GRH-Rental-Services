// ─ src/types/index.ts ─────────────────────────────────────────

/**
 * Central type exports for the application
 * Import types from this file throughout the application for consistency
 */

// Authentication types
export type {
  AuthModalView,
  AuthModalContextType,
  UserPasskey,
} from "./auth"

// Booking types
export type {
  BookingForRentalTeam,
  CalendarBooking,
  CreateBookingInput,
  UpdateBookingInput,
  BookingStatusUpdateInput,
} from "./booking"

// Internationalization types
export type { Locale, Translations, I18nContextProps } from "./i18n"

// Notification types
export type {
  NotificationData,
  SSEMessage,
  NotificationContextType,
} from "./notification"

// Routing types
export type { AppRoute } from "./routing"

// View and navigation types
export { View } from "./view"
export type { ViewContextType, NamePromptContextType } from "./view"

// Re-export NextAuth types for convenience
export type { Session, User } from "next-auth"
