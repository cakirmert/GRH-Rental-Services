import "server-only"

import { auth } from "../../../auth"
import prisma from "@/lib/prismadb"
import { IdentityAccessError, type CurrentAccount } from "./types"

export { IdentityAccessError } from "./types"

/**
 * Read the authenticated ID through the unchanged provider, then resolve current
 * profile and permissions from the database. Do not cache this authorization read.
 */
export async function getCurrentAccount(): Promise<CurrentAccount | null> {
  const session = await auth()
  const id = session?.user?.id
  if (!id) return null

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isSuperAdmin: true },
  })
  if (!user) return null
  return { ...user, image: session.user.image ?? null }
}

export async function requireCurrentAccount(): Promise<CurrentAccount> {
  const user = await getCurrentAccount()
  if (!user) throw new IdentityAccessError("UNAUTHENTICATED")
  return user
}

export async function requireStaff(): Promise<CurrentAccount> {
  const user = await requireCurrentAccount()
  if (user.role !== "RENTAL" && user.role !== "ADMIN") throw new IdentityAccessError("FORBIDDEN")
  return user
}

export async function requireAdmin(): Promise<CurrentAccount> {
  const user = await requireCurrentAccount()
  if (user.role !== "ADMIN") throw new IdentityAccessError("FORBIDDEN")
  return user
}
