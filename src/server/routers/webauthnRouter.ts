import { router, publicProcedure, protectedProcedure } from "@/lib/trpcServer"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { generatePasskeyToken } from "../../../auth"
import {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  normalizeCredentialId,
} from "@/lib/webauthn"
import type { Prisma } from "@prisma/client"
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/types"
import type { UserPasskey } from "@/types/auth"

const registrationChallenges = new Map<string, string>()
const authenticationChallenges = new Map<string, string>()
const rateLimit = new Map<string, { count: number; ts: number }>()
const VALID_TRANSPORTS: ReadonlySet<AuthenticatorTransportFuture> = new Set([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
])

function normalizeTransports(transports?: unknown): AuthenticatorTransportFuture[] | undefined {
  if (!Array.isArray(transports)) return undefined
  const normalized = transports
    .map((value) => (typeof value === "string" ? value.toLowerCase() : null))
    .filter((value): value is AuthenticatorTransportFuture => {
      if (!value) return false
      return VALID_TRANSPORTS.has(value as AuthenticatorTransportFuture)
    })
  return normalized.length ? normalized : undefined
}

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

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

      const rawCredentialId =
        typeof credential.id === "string"
          ? credential.id
          : Buffer.from(credential.id).toString("base64url")
      const normalizedCredentialID = normalizeCredentialId(rawCredentialId)

      if (!normalizedCredentialID) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to store credential ID" })
      }

      const publicKeyBytes =
        typeof credential.publicKey === "string"
          ? Buffer.from(credential.publicKey, "base64url")
          : Buffer.from(credential.publicKey)

      const passkeyRecord = {
        credentialID: normalizedCredentialID,
        credentialPublicKey: publicKeyBytes.toString("base64url"),
        counter: credential.counter ?? 0,
        transports: normalizeTransports(credential.transports),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        createdAt: new Date().toISOString(),
        name: `Device ${Date.now()}`,
      }

      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: {
          passkeys: {
            push: passkeyRecord,
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

      let allowCredentials: Array<{
        id: string
        transports?: AuthenticatorTransportFuture[]
      }> = []
      let userIds: string[] = []

      if (input.usernameOrEmail) {
        // Traditional flow: find user by email/username first
        const user = await ctx.prisma.user.findFirst({
          where: { OR: [{ email: input.usernameOrEmail }, { name: input.usernameOrEmail }] },
        })
        if (!user || !user.passkeys.length) throw new TRPCError({ code: "NOT_FOUND" })
        allowCredentials = (
          user.passkeys as Array<{
            credentialID: string
            transports?: AuthenticatorTransportFuture[] | string[]
          }>
        ).map((p) => ({
          id: p.credentialID,
          transports: normalizeTransports(p.transports),
        }))
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
                userPasskeys.map((p: UserPasskey) => ({
                  id: p.credentialID,
                  length: p.credentialID?.length,
                  hasInvalidChars:
                    p.credentialID?.includes("+") ||
                    p.credentialID?.includes("/") ||
                    p.credentialID?.includes("="),
                })),
              )
            }
            allowCredentials.push(
              ...userPasskeys.map((p: UserPasskey) => ({
                id: p.credentialID,
                transports: normalizeTransports(p.transports),
              })),
            )
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
            allowCredentials.map(({ id, transports }) => ({
              id,
              transports,
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

      const incomingCredentialCandidate = input.credential.rawId || input.credential.id
      const normalizedIncomingCredentialId = normalizeCredentialId(incomingCredentialCandidate)

      if (!normalizedIncomingCredentialId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid credential identifier" })
      }

      if (input.userId === "auto-detect") {
        if (process.env.NODE_ENV === "development") {
          console.log("🔍 Looking for credential ID:", incomingCredentialCandidate)
          console.log("🔍 Credential ID type:", typeof incomingCredentialCandidate)
          console.log("🔍 Credential ID length:", incomingCredentialCandidate?.length)
          console.log("🔍 Using rawId vs id:", {
            rawId: input.credential.rawId || "undefined",
            id: input.credential.id,
            usingRawId: !!input.credential.rawId,
            normalized: normalizedIncomingCredentialId,
          })
        }

        const users = await ctx.prisma.user.findMany({
          select: { id: true, email: true, passkeys: true },
        })

        if (process.env.NODE_ENV === "development") {
          console.log("👥 Found users with passkeys:", users.length)
        }

        for (const u of users) {
          if (!u.passkeys || !Array.isArray(u.passkeys)) continue

          const userPasskeys = u.passkeys as Array<{
            credentialID: string
            credentialPublicKey: string
            counter: number
            transports?: string[]
          }>

          if (process.env.NODE_ENV === "development") {
            console.log(
              `🔑 User ${u.email} has passkeys:`,
              userPasskeys.map((p) => ({
                id: p.credentialID,
                length: p.credentialID?.length,
                type: typeof p.credentialID,
                normalized: normalizeCredentialId(p.credentialID),
              })),
            )
          }

          const foundPasskey = userPasskeys.find((p) => {
            const normalizedStoredId = normalizeCredentialId(p.credentialID)
            return normalizedStoredId === normalizedIncomingCredentialId
          })

          if (foundPasskey) {
            if (process.env.NODE_ENV === "development") {
              console.log("✅ Found matching passkey for user:", u.email)
              console.log("🔍 Passkey data:", JSON.stringify(foundPasskey, null, 2))
            }
            user = await ctx.prisma.user.findUnique({ where: { id: u.id } })
            break
          }
        }

        if (!user && process.env.NODE_ENV === "development") {
          interface PasskeyCredential {
            credentialID: string
          }
          const usersWithPasskeys = await ctx.prisma.user.findMany({
            select: {
              id: true,
              email: true,
              passkeys: true,
            },
          })
          const availableCredentials = usersWithPasskeys.flatMap((u) => {
            const passkeys = u.passkeys as unknown as PasskeyCredential[] | null
            return (passkeys || []).map((p: PasskeyCredential) => p.credentialID)
          })
          console.log("❌ No user found for credential ID:", incomingCredentialCandidate)
          console.log("❌ Normalized credential ID:", normalizedIncomingCredentialId)
          console.log("❌ Available credential IDs:", availableCredentials)
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
        const normalizedStoredId = normalizeCredentialId(p.credentialID)
        if (!normalizedStoredId) return false
        if (normalizedStoredId !== normalizedIncomingCredentialId) return false
        if (normalizedStoredId !== p.credentialID) {
          p.credentialID = normalizedStoredId
        }
        return true
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
