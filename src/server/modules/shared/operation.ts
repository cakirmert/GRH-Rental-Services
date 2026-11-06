import type { PrismaClient } from "@prisma/client"

/** Server-established identity, independent of a session library or transport. */
export type Actor = {
  id: string
  role?: string
  isSuperAdmin?: boolean
  name?: string | null
  email?: string | null
}

export type DatabaseContext = { db: PrismaClient }
export type OperationContext = DatabaseContext & { actor: Actor }

export type OperationErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "PRECONDITION_FAILED"
  | "INTERNAL_SERVER_ERROR"

/** Expected application failures are translated at the transport boundary. */
export class OperationError extends Error {
  readonly code: OperationErrorCode
  constructor({ code, message }: { code: OperationErrorCode; message?: string }) {
    super(message ?? code)
    this.name = "OperationError"
    this.code = code
  }
}

export function assertAdmin(actor: Actor) {
  if (actor.role !== "ADMIN") throw new OperationError({ code: "FORBIDDEN" })
}

export function assertSuperAdmin(actor: Actor) {
  if (actor.role !== "ADMIN" || !actor.isSuperAdmin) {
    throw new OperationError({
      code: "FORBIDDEN",
      message: "Only the super admin can change admin roles.",
    })
  }
}
