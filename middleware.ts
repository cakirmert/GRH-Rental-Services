import { auth } from "./auth"

export default auth((req) => {
  // req.auth contains the session object or null
  // This middleware will run on all requests
  // You can add custom logic here if needed
  // For example, redirect to login page for protected routes
  // For now, we'll let NextAuth handle the session management
  // and let tRPC's protectedProcedure handle the authorization
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
