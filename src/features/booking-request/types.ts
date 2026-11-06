import type { Locale } from "date-fns"
import type { IdentitySession } from "@/features/identity/types"

export interface BookingItem {
  id: string
  name: string
  type: string
  capacity?: number
  players?: string
  images?: string[]
  description?: string
  longDescriptionKey?: string
  rules?: string | string[]
  totalQuantity?: number
}

export interface BookingRequestProps {
  item: BookingItem
  session: Pick<IdentitySession, "user"> | null
  authStatus: "authenticated" | "unauthenticated" | "loading"
  currentLocale: Locale
  onGoBack: () => void
  onBookingSuccess: (bookingId: string) => void
  onLoginRequest?: (email: string) => Promise<{ error?: string } | undefined>
}
