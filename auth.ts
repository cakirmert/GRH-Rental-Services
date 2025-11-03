import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import EmailProvider from "next-auth/providers/nodemailer"
import CredentialsProvider from "next-auth/providers/credentials"
import { normalizeEmail } from "@/utils/email"
import { Prisma } from "@prisma/client"

const otpRequests = new Map<string, { count: number; ts: number }>()
export const otpFailures = new Map<string, { count: number; locked: number }>()
export { otpRequests }

/**
 * In-memory storage for short-lived passkey login tokens
 */
export const passkeyTokens = new Map<string, { userId: string; expires: number }>()

/**
 * Generate a secure random token for passkey authentication
 * @param userId - The user ID to associate with the token
 * @returns A secure random token string
 */
export function generatePasskeyToken(userId: string) {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const token = Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
  passkeyTokens.set(token, { userId, expires: Date.now() + 5 * 60 * 1000 })
  return token
}
import prisma from "./src/lib/prismadb"
import { transporter, isDev, CONTACT_EMAIL } from "./src/lib/mail"

/**
 * Generate HMAC-SHA256 hash using Web Crypto API
 * @param data - The data to hash
 * @param secret - The secret key
 * @returns Promise resolving to hex-encoded hash
 */
async function generateHmacSha256(data: string, secret: string): Promise<string> {
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

// Export for use in API routes
export { generateHmacSha256 }

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Support both AUTH_SECRET and NEXTAUTH_SECRET for compatibility
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    EmailProvider({
      server: {
        host: process.env.SMTP_HOST!,
        port: Number(process.env.SMTP_PORT!),
        auth: {
          user: CONTACT_EMAIL,
          pass: process.env.EMAIL_PASSWORD,
        },
        requireTLS: true,
      },
      from: CONTACT_EMAIL,
      maxAge: 300,
      async generateVerificationToken() {
        const code = Math.floor(100000 + Math.random() * 900000).toString()
        const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
        if (!secret) {
          throw new Error("AUTH_SECRET environment variable is not set")
        }
        const h = await generateHmacSha256(code, secret)
        return `${code}.${h}`
      },
      async sendVerificationRequest({ identifier, token, provider, url }) {
        const key = normalizeEmail(identifier)
        const now = Date.now()
        const entry = otpRequests.get(key)
        if (entry && now - entry.ts < 60 * 60 * 1000) {
          if (entry.count >= 5) throw new Error("Too many OTP requests")
          entry.count += 1
        } else {
          otpRequests.set(key, { count: 1, ts: now })
        }
        const { host } = new URL(url)
        const code = token.split(".")[0]
        const text = `Your ${host} verification code is ${code}`
        const html = `
          <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px #0001; padding: 32px 24px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <img src='https://${host}/gustav.png' alt='GRH Logo' style='width: 64px; height: 64px; border-radius: 50%; background: #f3f3f3; margin-bottom: 8px;' />
              <h2 style="margin: 0; font-size: 1.5rem; color: #222;">GRH Booking</h2>
            </div>
            <p style="font-size: 1.1rem; color: #222; margin-bottom: 16px;">Your verification code:</p>
            <div style="font-size: 2.2rem; font-weight: bold; letter-spacing: 0.25em; color: #1a73e8; background: #f5faff; border-radius: 8px; padding: 16px 0; text-align: center; margin-bottom: 20px;">
              <b>${code}</b>
            </div>
            <p style="color: #444; font-size: 1rem; margin-bottom: 0;">Enter this code in the app to sign in.<br>For your security, this code will expire soon.</p>
            <p style="color: #888; font-size: 0.95rem; margin-top: 24px; text-align: center;">If you did not request this, you can ignore this email.</p>
          </div>
        `
        if (isDev) {
          console.log(`\n››› DEV OTP for ${identifier}: ${code}\n`)
        } else {
          await transporter!.sendMail({
            to: identifier,
            from: provider.from,
            subject: `Your ${host} verification code`,
            text,
            html,
          })
        }
      },
    }),
    CredentialsProvider({
      id: "passkey",
      name: "Passkey",
      credentials: {
        userId: { type: "text" },
        verified: { type: "text" }, // Flag to indicate passkey was already verified
      },
      async authorize(credentials) {
        console.log("🔐 NextAuth passkey authorize called with:", {
          userId: credentials?.userId,
          verified: credentials?.verified,
          hasUserId: !!credentials?.userId,
          hasVerified: !!credentials?.verified,
          verifiedValue: credentials?.verified,
          verifiedIsTrue: credentials?.verified === "true",
        })

        if (!credentials?.userId || credentials?.verified !== "true") {
          console.log("❌ NextAuth passkey authorize failed validation")
          return null
        }

        const id = credentials.userId as string
        console.log("🔍 Looking up user by ID:", id)

        // Find and return the user since passkey verification was already done
        const user = await prisma.user.findUnique({
          where: { id },
          select: { id: true, email: true, name: true, role: true },
        })

        console.log("🔍 User lookup result:", user ? "Found user" : "User not found", user?.email)

        return user
      },
    }),
    CredentialsProvider({
      id: "otp",
      name: "OTP",
      credentials: {
        email: { type: "email" },
        token: { type: "text" },
        verified: { type: "text" }, // Flag to indicate OTP was already verified
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.token || credentials?.verified !== "true") {
          return null
        }

        const email = normalizeEmail(credentials.email as string)

        // Find or create user
        let user = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { id: true, email: true, name: true, role: true },
        })

        if (user) {
          if (user.email !== email) {
            try {
              user = await prisma.user.update({
                where: { id: user.id },
                data: { email },
                select: { id: true, email: true, name: true, role: true },
              })
            } catch (error) {
              if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
              ) {
                const normalized = await prisma.user.findUnique({
                  where: { email },
                  select: { id: true, email: true, name: true, role: true },
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
          // Create new user if they don't exist
          user = await prisma.user.create({
            data: { email },
            select: { id: true, email: true, name: true, role: true },
          })
        }

        return user
      },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      if (account?.provider === "passkey") return true
      return true
    },
    async jwt({ token, user }) {
      // only runs at sign-in & on JWT refresh
      if (user) {
        token.sub = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub
        session.user.role = token.role as string

        // Fetch fresh user data from database to ensure name is up-to-date
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { name: true, email: true, role: true },
        })

        if (dbUser) {
          session.user.name = dbUser.name
          session.user.email = dbUser.email
          session.user.role = dbUser.role
        }
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
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24,
  },
  pages: {
    verifyRequest: "/auth/verify-request",
  },
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: { httpOnly: true, sameSite: "strict", secure: true },
    },
  },
})
