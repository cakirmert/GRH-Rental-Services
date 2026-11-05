import { router, publicProcedure, protectedProcedure } from "@/lib/trpcServer"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import {
  getRegistrationOptions, verifyRegistration, getAuthenticationOptions,
  verifyAuthentication, normalizeCredentialId,
} from "@/lib/webauthn"
import { consumeBudget, requestAddress, putSecretState, maintainAuthState } from "@/lib/auth/state"
import { browserBinding, clientChallenge, consumeCeremony, saveCeremony } from "@/lib/auth/ceremony"
import { commitPasskeyAuthentication, registerPasskey } from "@/lib/auth/passkey-store"
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server-v14"

// Strict outer limits before parsing/cryptographic work. The verifier validates the protocol fields.
const credentialSchema = z.object({
  id: z.string().min(16).max(2048), rawId: z.string().min(16).max(2048),
  type: z.string().refine(value => value === "public-key"),
  response: z.object({
    clientDataJSON: z.string().max(8192),
    attestationObject: z.string().max(65536).optional(),
    authenticatorData: z.string().max(65536).optional(),
    signature: z.string().max(8192).optional(),
    userHandle: z.string().max(1024).nullable().optional(),
    transports: z.array(z.string().max(32)).max(10).optional(),
    publicKey: z.string().max(8192).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
  }),
  clientExtensionResults: z.custom<object>(
    value => value !== null && typeof value === "object" && !Array.isArray(value),
  ).optional(),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
})

async function budget(req: Request | undefined, userId?: string) {
  if (!(await consumeBudget("webauthn-global", "all", 600, 60_000)) ||
      !(await consumeBudget("webauthn-address", requestAddress(req), 30, 60_000)) ||
      (userId && !(await consumeBudget("webauthn-user", userId, 20, 60_000)))) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS" })
  }
}

const rejected = () => new TRPCError({ code: "BAD_REQUEST", message: "Passkey verification failed. Please try again." })

export const webauthnRouter = router({
  registerOptions: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (input.userId !== ctx.session.user.id) throw new TRPCError({ code: "FORBIDDEN" })
      await budget(ctx.req, ctx.session.user.id)
      const user = await ctx.prisma.user.findUnique({ where: { id: ctx.session.user.id } })
      if (!user) throw rejected()
      const opts = await getRegistrationOptions(user.id, user.email)
      await saveCeremony(opts.challenge, "registration", user.id)
      return opts
    }),

  register: protectedProcedure
    .input(z.object({ credential: credentialSchema }))
    .mutation(async ({ input, ctx }) => {
      await budget(ctx.req, ctx.session.user.id)
      try {
        const challenge = clientChallenge(input.credential)
        if (!(await consumeCeremony(challenge, "registration", ctx.session.user.id))) throw rejected()
        const verification = await verifyRegistration(input.credential as RegistrationResponseJSON, challenge)
        if (!verification.verified || !verification.registrationInfo) throw rejected()
        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
        const id = normalizeCredentialId(credential.id)
        if (!id) throw rejected()
        await registerPasskey(ctx.session.user.id, {
          credentialID: id,
          credentialPublicKey: Buffer.from(credential.publicKey).toString("base64url"),
          counter: credential.counter,
          transports: credential.transports,
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          createdAt: new Date().toISOString(),
          name: "Device " + Date.now(),
        })
        return { ok: true }
      } catch { throw rejected() }
    }),

  loginOptions: publicProcedure
    .input(z.object({ usernameOrEmail: z.string().max(254).optional() }))
    .mutation(async ({ ctx }) => {
      await budget(ctx.req)
      await maintainAuthState()
      // Discoverable credentials stay on the authenticator: never enumerate accounts or IDs.
      const opts = await getAuthenticationOptions([])
      await saveCeremony(opts.challenge, "authentication")
      return opts
    }),

  login: publicProcedure
    .input(z.object({ userId: z.string().max(256), credential: credentialSchema }))
    .mutation(async ({ input, ctx }) => {
      await budget(ctx.req)
      try {
        const challenge = clientChallenge(input.credential)
        if (!(await consumeCeremony(challenge, "authentication"))) throw rejected()
        const id = normalizeCredentialId(input.credential.rawId)
        if (!id || id !== normalizeCredentialId(input.credential.id)) throw rejected()
        const alias = await ctx.prisma.passkeyCredentialAlias.findUnique({
          where: { id }, include: { credential: true },
        })
        const stored = alias?.credential
        if (!stored || stored.revokedAt ||
            (input.userId !== "auto-detect" && input.userId !== stored.userId)) throw rejected()
        const verification = await verifyAuthentication(input.credential as AuthenticationResponseJSON, challenge, {
          credentialID: stored.legacyCredentialId,
          credentialPublicKey: stored.credentialPublicKey,
          counter: Number(stored.counter),
        })
        if (!verification.verified) throw rejected()
        const binding = await browserBinding()
        if (!binding) throw rejected()
        const token = await commitPasskeyAuthentication(
          stored.id, stored.userId, Number(stored.counter), verification.authenticationInfo.newCounter,
          tx => putSecretState("passkey-session", { userId: stored.userId, credentialId: stored.id, binding }, 60_000, tx),
        )
        return { ok: true, token }
      } catch { throw rejected() }
    }),
})
