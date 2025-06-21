// ─ src/types/auth.ts ─────────────────────────────────────────

/**
 * Authentication related types
 */

export type AuthModalView = "email" | "otp"

export interface AuthModalContextType {
  authModalOpen: boolean
  openAuthModal: (initialView?: AuthModalView, email?: string, onClose?: () => void) => void
  closeAuthModal: () => void
  authModalView: AuthModalView
  email: string
  setEmail: (email: string) => void
  otp: string
  setOtp: (otp: string) => void
  isSubmittingAuth: boolean
  authError: string | null
}

// WebAuthn/Passkey related types
export interface UserPasskey {
  credentialID: string
  name?: string
  createdAt?: string
}
