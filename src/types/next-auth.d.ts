// ─ src/types/next-auth.d.ts ─────────────

import { DefaultSession } from "next-auth"

declare module "next-auth" {
  /**
   * The session object that `useSession()` and `getSession()` return.
   * We extend it so that `session.user` always has `id` and `role`.
   */
  interface Session extends DefaultSession {
    user: {
      /** Your Prisma user's ID */
      id: string
      /** Your Prisma user's role (e.g. "ADMIN", "RENTAL", etc.) */
      role?: string
    } & DefaultSession["user"]
  }

  /**
   * The User object that NextAuth creates in `jwt()` callback.
   * We extend it so TypeScript knows our User model has `id` and `role`.
   */
  interface User {
    /** Your Prisma user's ID */
    id: string
    /** Your Prisma user's role */
    role?: string
    email: string
    name?: string | null
    image?: string | null
  }
}
