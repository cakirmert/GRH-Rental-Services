import { TRPCError } from "@trpc/server"
import type { Context } from "@/server/context"
import { OperationError, type DatabaseContext, type OperationContext } from "./operation"

async function translate<T>(operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof OperationError) {
      throw new TRPCError({ code: error.code, message: error.message, cause: error })
    }
    // Existing hardened transaction/capacity helpers already return typed failures.
    throw error
  }
}

export function invoke<T>(ctx: Context, operation: (context: OperationContext) => Promise<T> | T) {
  const user = ctx.session?.user
  if (!user?.id) throw new TRPCError({ code: "UNAUTHORIZED" })
  return translate(() =>
    operation({
      db: ctx.prisma,
      actor: {
        id: user.id,
        role: user.role,
        isSuperAdmin: user.isSuperAdmin,
        name: user.name,
        email: user.email,
      },
    }),
  )
}

export function invokePublic<T>(
  ctx: Context,
  operation: (context: DatabaseContext) => Promise<T> | T,
) {
  return translate(() => operation({ db: ctx.prisma }))
}
