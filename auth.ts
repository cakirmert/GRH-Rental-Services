import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import { Prisma } from "@prisma/client"
import { consumeOtp, parseMailbox } from "@/lib/auth/otp"
import { browserBinding } from "@/lib/auth/ceremony"
import { consumeBoundSecretState, consumeBudget, requestAddress } from "@/lib/auth/state"
import { authConfig } from "./auth.config"
import prisma from "./src/lib/prismadb"
import { recordAccountActivity } from "@/lib/auth/activity"

function getAuthSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
}

async function findOrCreateUserByEmail(email: string) {
  let user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, role: true, isSuperAdmin: true },
  })

  if (user) {
    if (user.email !== email) {
      try {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { email },
          select: { id: true, email: true, name: true, role: true, isSuperAdmin: true },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const normalized = await prisma.user.findUnique({
            where: { email },
            select: { id: true, email: true, name: true, role: true, isSuperAdmin: true },
          })
          if (normalized) {
            user = normalized
          } else {
            throw error
          }
        } else {
          throw error
        }
      }
    }
  } else {
    user = await prisma.user.create({
      data: { email },
      select: { id: true, email: true, name: true, role: true, isSuperAdmin: true },
    })
  }

  return user
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  secret: getAuthSecret(),
  providers: [
    CredentialsProvider({
      id: "passkey",
      name: "Passkey",
      credentials: {
        token: { type: "text" },
      },
      async authorize(credentials, request) {
        // Every exchange path, including Auth.js's public callback, crosses this budget.
        if (
          !(await consumeBudget("passkey-exchange-global", "all", 600, 60_000)) ||
          !(await consumeBudget("passkey-exchange-address", requestAddress(request), 30, 60_000))
        )
          return null
        const token = credentials?.token
        if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
        const binding = await browserBinding()
        if (!binding) return null
        const entry = await consumeBoundSecretState("passkey-session", token, binding)
        if (
          !entry ||
          entry.binding !== binding ||
          typeof entry.userId !== "string" ||
          typeof entry.credentialId !== "string"
        )
          return null
        const credential = await prisma.passkeyCredential.findUnique({
          where: { id: entry.credentialId },
        })
        if (!credential || credential.revokedAt || credential.userId !== entry.userId) return null

        return prisma.user.findUnique({
          where: { id: entry.userId },
          select: { id: true, email: true, name: true, role: true, isSuperAdmin: true },
        })
      },
    }),
    CredentialsProvider({
      id: "otp",
      name: "OTP",
      credentials: {
        email: { type: "email" },
        token: { type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.token) return null

        const email = parseMailbox(credentials.email)
        if (!email) return null
        const verified = await consumeOtp(email, String(credentials.token).trim())
        if (!verified) return null

        return findOrCreateUserByEmail(email)
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
        session.user.role = token.role as string
        session.user.isSuperAdmin = Boolean(token.isSuperAdmin)

        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { name: true, email: true, role: true, isSuperAdmin: true, lastActiveAt: true },
        })

        if (!dbUser) {
          session.user.id = ""
          session.user.name = null
          session.user.email = ""
          session.user.role = undefined
          session.user.isSuperAdmin = false
          return session
        }

        session.user.name = dbUser.name
        session.user.email = dbUser.email
        session.user.role = dbUser.role
        session.user.isSuperAdmin = dbUser.isSuperAdmin
        await recordAccountActivity(prisma, token.sub, dbUser.lastActiveAt)
      }
      return session
    },
  },
  events: {
    async signIn({ user, account }) {
      try {
        const now = new Date()
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: now, lastActiveAt: now },
        })
      } catch (err) {
        console.error("Error updating lastLoginAt", err)
      }

      if (account?.provider === "email" || account?.provider === "otp") {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { emailVerified: true },
        })

        if (!dbUser?.emailVerified) {
          try {
            await prisma.user.update({
              where: { id: user.id },
              data: { emailVerified: new Date() },
            })
          } catch (err) {
            console.error("Error updating emailVerified", err)
          }
        }
      }
    },
  },
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: { httpOnly: true, sameSite: "strict", secure: true },
    },
  },
})
