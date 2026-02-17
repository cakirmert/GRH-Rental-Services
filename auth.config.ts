import type { NextAuthConfig } from "next-auth"

export const authConfig = {
    providers: [], // Providers will be added in auth.ts for Node runtime
    pages: {
        verifyRequest: "/auth/verify-request",
        signIn: "/auth/signin",
    },
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user
            const isOnDashboard = nextUrl.pathname.startsWith("/dashboard")
            const isOnAdmin = nextUrl.pathname.startsWith("/admin")

            if (isOnDashboard || isOnAdmin) {
                if (isLoggedIn) return true
                return false // Redirect unauthenticated users to login page
            }
            return true
        },
        async jwt({ token, user }) {
            if (user) {
                token.sub = user.id
                token.role = user.role
            }
            return token
        },
        async session({ session, token }) {
            if (token.sub && session.user) {
                session.user.id = token.sub
                session.user.role = token.role as string
            }
            return session
        },
    },
    session: {
        strategy: "jwt",
        maxAge: 60 * 60 * 24,
    },
} satisfies NextAuthConfig
