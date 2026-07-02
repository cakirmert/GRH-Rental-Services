import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import CredentialsProvider from "next-auth/providers/credentials"
import { Prisma } from "@prisma/client"
import { normalizeEmail } from "@/utils/email"
import { authConfig } from "./auth.config"
import prisma from "./src/lib/prismadb"

const OTP_CODE_PATTERN = /^\d{6}$/
const otpRequests = new Map<string, { count: number; ts: number }>()
export const otpFailures = new Map<string, { count: number; locked: number }>()
const passkeyTokens = new Map<string, { userId: string; expires: number }>()
export { otpRequests }

export function generatePasskeyToken(userId: string) {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const token = Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
  passkeyTokens.set(token, { userId, expires: Date.now() + 5 * 60 * 1000 })
  return token
}

export async function generateHmacSha256(data: string, secret: string): Promise<string> {
  const secretKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", secretKey, new TextEncoder().encode(data))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function getAuthSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
}

function handleOtpFailure(
  emailKey: string,
  currentFailState: { count: number; locked: number } | undefined,
  currentTimestamp: number,
) {
  const count = currentFailState ? currentFailState.count + 1 : 1
  if (count >= 5) {
    otpFailures.set(emailKey, { count: 0, locked: currentTimestamp + 15 * 60 * 1000 })
  } else {
    otpFailures.set(emailKey, { count, locked: 0 })
  }
}

async function consumeOtpCode(email: string, token: string) {
  const now = Date.now()
  const fail = otpFailures.get(email)
  if (fail && fail.locked > now) return false

  const activeToken = await prisma.verificationToken.findFirst({
    where: {
      identifier: email,
      expires: { gt: new Date() },
    },
    select: { identifier: true },
  })
  if (!activeToken) return false

  const code = token.trim()
  if (!OTP_CODE_PATTERN.test(code)) {
    handleOtpFailure(email, fail, now)
    return false
  }

  const secret = getAuthSecret()
  if (!secret) {
    throw new Error("AUTH_SECRET environment variable is not set")
  }

  const h = await generateHmacSha256(code, secret)
  const fullToken = `${code}.${h}`
  const verificationToken = await prisma.verificationToken.findFirst({
    where: {
      identifier: email,
      token: fullToken,
      expires: { gt: new Date() },
    },
  })

  if (!verificationToken) {
    handleOtpFailure(email, fail, now)
    return false
  }

  await prisma.verificationToken.deleteMany({
    where: {
      identifier: email,
      token: fullToken,
    },
  })
  otpFailures.delete(email)
  return true
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
      async authorize(credentials) {
        if (!credentials?.token) return null

        const token = String(credentials.token)
        const entry = passkeyTokens.get(token)
        if (!entry || entry.expires < Date.now()) {
          passkeyTokens.delete(token)
          return null
        }
        passkeyTokens.delete(token)

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

        const email = normalizeEmail(credentials.email as string)
        const verified = await consumeOtpCode(email, String(credentials.token))
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
          select: { name: true, email: true, role: true, isSuperAdmin: true },
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
      }
      return session
    },
  },
  events: {
    async signIn({ user, account }) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
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
