/** Application-owned identity types; provider and database types stay in the adapters. */
export type AccountRole = "USER" | "RENTAL" | "ADMIN"
export type IdentityStatus = "loading" | "authenticated" | "unauthenticated"

export interface CurrentAccount {
  id: string
  name: string | null
  email: string
  image: string | null
  role: AccountRole
  isSuperAdmin: boolean
}

/** Compatibility input for the existing session provider, including SSR/test sessions. */
export interface IdentitySession {
  user: {
    id: string
    name?: string | null
    email: string | null
    image?: string | null
    role?: string
    isSuperAdmin?: boolean
  }
  expires: string
}

export type IdentityAccessCode = "UNAUTHENTICATED" | "FORBIDDEN"

export class IdentityAccessError extends Error {
  readonly status: 401 | 403

  constructor(readonly code: IdentityAccessCode) {
    super(code === "UNAUTHENTICATED" ? "Sign in to continue." : "This account does not have access.")
    this.name = "IdentityAccessError"
    this.status = code === "UNAUTHENTICATED" ? 401 : 403
  }
}
