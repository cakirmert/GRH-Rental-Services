import { router, publicProcedure, protectedProcedure } from "@/lib/trpcServer"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { generatePasskeyToken } from "../../../auth"
import {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
} from "@/lib/webauthn"
import type { Prisma } from "@prisma/client"
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/types"
import type { UserPasskey } from "@/types/auth"

const registrationChallenges = new Map<string, string>()
const authenticationChallenges = new Map<string, string>()
const rateLimit = new Map<string, { count: number; ts: number }>()

function checkRateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const entry = rateLimit.get(key)
  if (entry && now - entry.ts < windowMs) {
    if (entry.count >= max) throw new TRPCError({ code: "TOO_MANY_REQUESTS" })
    entry.count += 1
  } else {
    rateLimit.set(key, { count: 1, ts: now })
  }
}

export const webauthnRouter = router({
  registerOptions: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      checkRateLimit(
        ctx.req?.headers?.get("x-forwarded-for") ||
          (ctx.req as unknown as { ip?: string }).ip ||
          "ip",
        5,
        60_000,
      )
      const user = await ctx.prisma.user.findUnique({ where: { id: input.userId } })
      if (!user) throw new TRPCError({ code: "NOT_FOUND" })
      const opts = await getRegistrationOptions(user.id, user.email)
      registrationChallenges.set(user.id, opts.challenge)
      return opts
    }),
  register: protectedProcedure
    .input(z.object({ credential: z.any() }))
    .mutation(async ({ input, ctx }) => {
      const challenge = registrationChallenges.get(ctx.session.user.id)
      if (!challenge) throw new TRPCError({ code: "BAD_REQUEST" })
      const verification = await verifyRegistration(
        input.credential as RegistrationResponseJSON,
        challenge,
      )
      if (!verification.verified || !verification.registrationInfo) {
        throw new TRPCError({ code: "BAD_REQUEST" })
      }

      const { credential } = verification.registrationInfo
      const { id: credentialID, publicKey: credentialPublicKey } = credential
      const counter = 0 // New credentials start with counter 0
      
      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          passkeys: {
            push: {
              credentialID: Buffer.from(credentialID).toString("base64url"),
              credentialPublicKey: Buffer.from(credentialPublicKey).toString("base64url"),
              counter,
              createdAt: new Date().toISOString(),
              name: `Device ${Date.now()}`, // Basic device identifier
            },
          },
        },
      })
      registrationChallenges.delete(ctx.session.user.id)
      return { verified: true }
    }),

  loginOptions: publicProcedure
    .input(z.object({ usernameOrEmail: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      checkRateLimit(
        ctx.req?.headers?.get("x-forwarded-for") ||
          (ctx.req as unknown as { ip?: string }).ip ||
          "ip",
        5,
        60_000,
      )

      let allowCredentials: string[] = []
      let userIds: string[] = []

      if (input.usernameOrEmail) {
        // Traditional flow: find user by email/username first
        const user = await ctx.prisma.user.findFirst({
          where: { OR: [{ email: input.usernameOrEmail }, { name: input.usernameOrEmail }] },
        })
        if (!user || !user.passkeys.length) throw new TRPCError({ code: "NOT_FOUND" })
        allowCredentials = (user.passkeys as Array<{ credentialID: string }>).map(
          (p) => p.credentialID,
        )
        userIds = [user.id]
      } else {
        // Usernameless flow: get all users' passkeys for discoverable credentials
        if (process.env.NODE_ENV === "development") {
          console.log("🔍 Usernameless passkey flow - getting all users...")
        }
        const users = await ctx.prisma.user.findMany({
          select: {
            id: true,
            email: true,
            passkeys: true,
          },
        })

        if (process.env.NODE_ENV === "development") {
          console.log(`👥 Found ${users.length} total users`)
        }

        // Collect all credential IDs and map them to user IDs
        users.forEach((user) => {
          if (user.passkeys && Array.isArray(user.passkeys)) {
            const userPasskeys = user.passkeys as unknown as UserPasskey[]
            if (process.env.NODE_ENV === "development") {
              console.log(
                `🔑 User ${user.email} has ${userPasskeys.length} passkeys:`,
                userPasskeys.map(
                  (p: UserPasskey) => ({
                    id: p.credentialID,
                    length: p.credentialID?.length,
                    hasInvalidChars:
                      p.credentialID?.includes("+") ||
                      p.credentialID?.includes("/") ||
                      p.credentialID?.includes("="),
                  }),
                ),
              )
            }
            allowCredentials.push(...userPasskeys.map((p: UserPasskey): string => p.credentialID))
            userIds.push(user.id)
          } else {
            if (process.env.NODE_ENV === "development") {
              console.log(`📭 User ${user.email} has no passkeys`)
            }
          }
        })

        if (process.env.NODE_ENV === "development") {
          console.log(`🔐 Total passkeys found: ${allowCredentials.length}`)
          console.log(
            `📋 Credential IDs to be processed:`,
            allowCredentials.map((id) => ({
              id,
              length: id?.length,
              hasBase64Chars: id?.includes("+") || id?.includes("/") || id?.includes("="),
              hasBase64urlChars: id?.includes("-") || id?.includes("_"),
            })),
          )
        }

        if (allowCredentials.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No passkeys found" })
        }
      }

      const opts = await getAuthenticationOptions(allowCredentials)

      // Store challenge for all possible user IDs in usernameless flow
      userIds.forEach((userId) => {
        authenticationChallenges.set(userId, opts.challenge)
      })

      return opts
    }),
  login: publicProcedure
    .input(z.object({ userId: z.string(), credential: z.any() }))
    .mutation(async ({ input, ctx }) => {
      let user

      if (process.env.NODE_ENV === "development") {
        console.log("🔐 Passkey login attempt:", {
          userId: input.userId,
          credentialRawId: input.credential.rawId,
          credentialId: input.credential.id,
        })
      }

      if (input.userId === "auto-detect") {
        // Auto-detect user from credential ID
        const credentialId = input.credential.rawId || input.credential.id // Use rawId if available, fallback to id

        if (process.env.NODE_ENV === "development") {
          console.log("🔍 Looking for credential ID:", credentialId)
          console.log("🔍 Credential ID type:", typeof credentialId)
          console.log("🔍 Credential ID length:", credentialId?.length)
          console.log("🔍 Using rawId vs id:", {
            rawId: input.credential.rawId || "undefined",
            id: input.credential.id,
            usingRawId: !!input.credential.rawId,
          })
        }
        // Find user by searching through all passkeys
        const users = await ctx.prisma.user.findMany({
          select: { id: true, email: true, passkeys: true },
        })

        if (process.env.NODE_ENV === "development") {
          console.log("👥 Found users with passkeys:", users.length)
        }
        for (const u of users) {
          if (u.passkeys && Array.isArray(u.passkeys)) {
            const userPasskeys = u.passkeys as Array<{
              credentialID: string
              credentialPublicKey: string
              counter: number
            }>

            if (process.env.NODE_ENV === "development") {
              console.log(
                `🔑 User ${u.email} has passkeys:`,
                userPasskeys.map((p) => ({
                  id: p.credentialID,
                  length: p.credentialID?.length,
                  type: typeof p.credentialID,
                })),
              )
            }

            // Try exact match first
            let foundPasskey = userPasskeys.find((p) => p.credentialID === credentialId)

            // If not found, try converting between base64 and base64url
            if (!foundPasskey && credentialId) {
              // Try converting base64url to base64 (add padding)
              const base64Version = credentialId.replace(/-/g, "+").replace(/_/g, "/")
              const paddedBase64 = base64Version + "=".repeat((4 - (base64Version.length % 4)) % 4)
              foundPasskey = userPasskeys.find((p) => p.credentialID === paddedBase64)

              if (!foundPasskey) {
                // Try converting base64 to base64url (remove padding)
                const base64urlVersion = credentialId
                  .replace(/\+/g, "-")
                  .replace(/\//g, "_")
                  .replace(/=+$/, "")
                foundPasskey = userPasskeys.find((p) => p.credentialID === base64urlVersion)
              }
            }
            if (foundPasskey) {
              if (process.env.NODE_ENV === "development") {
                console.log("✅ Found matching passkey for user:", u.email)
                console.log("🔍 Passkey data:", JSON.stringify(foundPasskey, null, 2))
              }
              user = await ctx.prisma.user.findUnique({ where: { id: u.id } })
              break
            }
          }
        }

        if (!user) {
          interface PasskeyCredential {
            credentialID: string
          }

          const users = await ctx.prisma.user.findMany({
            select: {
              id: true,
              email: true,
              passkeys: true,
            },
          })

          // Log available credential IDs for debugging in development
          if (process.env.NODE_ENV === "development") {
            const availableCredentials = users.flatMap((u) => {
              const passkeys = u.passkeys as unknown as PasskeyCredential[] | null
              return (passkeys || []).map((p: PasskeyCredential) => p.credentialID)
            })
            console.log("❌ No user found for credential ID:", credentialId)
            console.log("❌ Available credential IDs:", availableCredentials)
          }
        }
      } else {
        user = await ctx.prisma.user.findUnique({ where: { id: input.userId } })
      }

      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found for passkey" })
      const challenge = authenticationChallenges.get(user.id)
      if (!challenge) {
        if (process.env.NODE_ENV === "development") {
          console.log("❌ No challenge found for user:", user.id)
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "No challenge found" })
      }
      const passkey = (
        user.passkeys as Array<{
          credentialID: string
          credentialPublicKey: string
          counter: number
        }>
      ).find((p) => {
        const credentialId = input.credential.rawId || input.credential.id // Use same logic as above

        // Try exact match first
        if (p.credentialID === credentialId) return true

        // Try base64url to base64 conversion
        const base64Version = credentialId.replace(/-/g, "+").replace(/_/g, "/")
        const paddedBase64 = base64Version + "=".repeat((4 - (base64Version.length % 4)) % 4)
        if (p.credentialID === paddedBase64) return true

        // Try base64 to base64url conversion
        const base64urlVersion = credentialId
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "")
        if (p.credentialID === base64urlVersion) return true

        return false
      })
      if (!passkey) {
        if (process.env.NODE_ENV === "development") {
          console.log("❌ No passkey found for credential:", input.credential.id)
        }
        throw new TRPCError({ code: "BAD_REQUEST", message: "Passkey not found" })
      }

      if (!passkey.credentialPublicKey) {
        if (process.env.NODE_ENV === "development") {
          console.log("❌ Passkey found but credentialPublicKey is missing:", passkey)
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Passkey data is incomplete (missing credentialPublicKey). Please re-register your passkey.",
        })
      }

      const verification = await verifyAuthentication(
        input.credential as AuthenticationResponseJSON,
        challenge,
        passkey,
      )
      if (!verification.verified || !verification.authenticationInfo)
        throw new TRPCError({ code: "BAD_REQUEST" })

      passkey.counter = verification.authenticationInfo.newCounter
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { passkeys: user.passkeys as Prisma.InputJsonValue[] },
      })
      authenticationChallenges.delete(user.id)
      const token = generatePasskeyToken(user.id)
      return { verified: true, token }
    }),
})
