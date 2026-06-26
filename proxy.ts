import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const { auth } = NextAuth(authConfig)

/**
 * NextAuth proxy for handling authentication
 * Runs on all requests and makes session available via req.auth
 */
export const proxy = auth(() => {
  // Session handling is managed by NextAuth
  // Custom logic can be added here if needed
  // tRPC's protectedProcedure handles the authorization
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
