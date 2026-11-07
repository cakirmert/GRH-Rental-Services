import { Prisma } from "@prisma/client"
import prisma from "@/lib/prismadb"
import type { UserPasskey } from "@/types/auth"
import { getCredentialIdCandidates } from "@/lib/webauthn"
import { assertPasskeyManagementAllowed } from "./passkey-policy"

export async function lockPasskeyUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
  const user = await tx.user.findUnique({ where: { id: userId }, select: { passkeys: true } })
  if (!user) throw new Error("User not found")
  return user.passkeys as unknown as UserPasskey[]
}

export function validateLegacyPasskey(value: unknown): UserPasskey {
  const p = value as UserPasskey | null
  if (
    !p ||
    typeof p.credentialID !== "string" ||
    !getCredentialIdCandidates(p.credentialID).length ||
    typeof p.credentialPublicKey !== "string" ||
    !/^[A-Za-z0-9+/_-]+={0,2}$/.test(p.credentialPublicKey) ||
    Buffer.from(p.credentialPublicKey, "base64").length === 0 ||
    !Number.isSafeInteger(p.counter) ||
    p.counter < 0 ||
    p.counter > 0xffffffff
  ) {
    throw new Error("Malformed legacy passkey; migration stopped without discarding data")
  }
  return p
}

/** Does not rewrite legacy JSON. Alias uniqueness rejects ambiguous or duplicate ownership. */
export async function indexLegacyPasskey(
  tx: Prisma.TransactionClient,
  userId: string,
  value: unknown,
) {
  const p = validateLegacyPasskey(value)
  const existing = await tx.passkeyCredential.findUnique({
    where: { userId_legacyCredentialId: { userId, legacyCredentialId: p.credentialID } },
  })
  if (existing) {
    if (
      existing.credentialPublicKey !== p.credentialPublicKey ||
      existing.revokedAt ||
      existing.counter !== BigInt(p.counter)
    ) {
      throw new Error(
        "Passkey index mismatch or revoked credential; manual reconciliation required",
      )
    }
    const expectedAliases = getCredentialIdCandidates(p.credentialID)
    const aliases = await tx.passkeyCredentialAlias.findMany({
      where: { credentialId: existing.id },
      select: { id: true },
    })
    if (
      aliases.length !== expectedAliases.length ||
      expectedAliases.some((id) => !aliases.some((alias) => alias.id === id))
    ) {
      throw new Error("Passkey aliases mismatch; manual reconciliation required")
    }
    return existing
  }
  return tx.passkeyCredential.create({
    data: {
      userId,
      legacyCredentialId: p.credentialID,
      credentialPublicKey: p.credentialPublicKey,
      counter: BigInt(p.counter),
      metadata: p as unknown as Prisma.InputJsonObject,
      aliases: { create: getCredentialIdCandidates(p.credentialID).map((id) => ({ id })) },
    },
  })
}

export async function registerPasskey(userId: string, p: UserPasskey) {
  assertPasskeyManagementAllowed()
  return prisma.$transaction(async (tx) => {
    const passkeys = await lockPasskeyUser(tx, userId)
    if (passkeys.length >= 20) throw new Error("Passkey limit reached")
    if (
      await tx.passkeyCredentialAlias.findFirst({
        where: { id: { in: getCredentialIdCandidates(p.credentialID) } },
      })
    ) {
      throw new Error("Credential already registered")
    }
    await indexLegacyPasskey(tx, userId, p)
    await tx.user.update({
      where: { id: userId },
      data: {
        passkeys: [...passkeys, p] as unknown as Prisma.InputJsonValue[],
      },
    })
  })
}

export async function revokePasskey(userId: string, credentialId: string) {
  assertPasskeyManagementAllowed()
  await prisma.$transaction(async (tx) => {
    const passkeys = await lockPasskeyUser(tx, userId)
    const existing = passkeys.find((p) => p.credentialID === credentialId)
    if (!existing) throw new Error("Passkey not found")
    // Retained tombstones prevent a later backfill or an in-flight login from restoring access.
    await tx.passkeyCredential.updateMany({
      where: { userId, legacyCredentialId: existing.credentialID, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await tx.user.update({
      where: { id: userId },
      data: {
        passkeys: passkeys.filter(
          (p) => p.credentialID !== credentialId,
        ) as unknown as Prisma.InputJsonValue[],
      },
    })
  })
}

export async function commitPasskeyAuthentication(
  credentialId: string,
  userId: string,
  previousCounter: number,
  newCounter: number,
  issueToken: (tx: Prisma.TransactionClient) => Promise<string>,
) {
  return prisma.$transaction(async (tx) => {
    const passkeys = await lockPasskeyUser(tx, userId)
    const stored = await tx.passkeyCredential.findUnique({ where: { id: credentialId } })
    if (
      !stored ||
      stored.userId !== userId ||
      stored.revokedAt ||
      Number(stored.counter) !== previousCounter
    ) {
      throw new Error("Passkey changed or revoked; retry authentication")
    }
    const legacy = passkeys.find((p) => p.credentialID === stored.legacyCredentialId)
    if (!legacy || newCounter < previousCounter) throw new Error("Passkey is unavailable")
    legacy.counter = newCounter
    legacy.lastUsed = new Date().toISOString()
    await tx.passkeyCredential.update({
      where: { id: credentialId },
      data: {
        counter: BigInt(newCounter),
        lastUsedAt: new Date(),
      },
    })
    await tx.user.update({
      where: { id: userId },
      data: { passkeys: passkeys as unknown as Prisma.InputJsonValue[] },
    })
    return issueToken(tx)
  })
}
