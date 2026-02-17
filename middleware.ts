import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

export const { auth } = NextAuth(authConfig)

/**
 * NextAuth middleware for handling authentication
 * Runs on all requests and makes session available via req.auth
 */
export default auth(() => {
  // Session handling is managed by NextAuth
  // Custom logic can be added here if needed
  // tRPC's protectedProcedure handles the authorization
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
