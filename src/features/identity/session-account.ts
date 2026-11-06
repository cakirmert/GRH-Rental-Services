import type { CurrentAccount, IdentitySession } from "./types"

/** Session data is a UI snapshot, never the authority for a protected server operation. */
export function accountFromSession(session: IdentitySession | null | undefined): CurrentAccount | null {
  const user = session?.user
  // The existing auth callback clears id when the underlying account was deleted.
  if (!user?.id) return null
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? "",
    image: user.image ?? null,
    role: user.role === "ADMIN" || user.role === "RENTAL" ? user.role : "USER",
    isSuperAdmin: user.isSuperAdmin === true,
  }
}
