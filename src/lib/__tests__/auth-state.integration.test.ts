// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"

const target = process.env.TEST_DATABASE_URL
const integration = target ? describe : describe.skip

integration("durable authentication state against disposable PostgreSQL", () => {
  const prefix = `auth-test-${randomUUID()}`
  let prisma: typeof import("../prismadb").default
  let state: typeof import("../auth/state")
  let otp: typeof import("../auth/otp")
  let passkeys: typeof import("../auth/passkey-store")
  const userId = prefix
  const id = Buffer.from(`credential-${prefix}`).toString("base64url")

  beforeAll(async () => {
    if (!target || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(target).hostname)) {
      throw new Error("Integration tests require an explicit local disposable database")
    }
    process.env.DATABASE_URL = target
    process.env.AUTH_SECRET = "test-secret-for-local-database-only"
    prisma = (await import("../prismadb")).default
    state = await import("../auth/state")
    otp = await import("../auth/otp")
    passkeys = await import("../auth/passkey-store")
    await prisma.user.create({ data: { id: userId, email: `${prefix}@example.com` } })
  })

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({ where: { id: userId } })
      await prisma.authState.deleteMany({ where: { key: { startsWith: `rate:${prefix}` } } })
      await prisma.$disconnect()
    }
  })

  it("admits exactly five concurrent budget claims and resets expired windows", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => state.consumeBudget(prefix, "subject", 5, 60_000)))
    expect(results.filter(Boolean)).toHaveLength(5)
    await prisma.authState.updateMany({ where: { key: { startsWith: `rate:${prefix}:` } }, data: { expiresAt: new Date(0) } })
    expect(await state.consumeBudget(prefix, "subject", 5, 60_000)).toBe(true)
  })

  it("consumes a session exchange once across concurrent requests", async () => {
    const token = await state.putSecretState(prefix, { userId })
    const results = await Promise.all(Array.from({ length: 10 }, () => state.consumeSecretState(prefix, token)))
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it("preserves a session exchange when a different browser presents it", async () => {
    const binding = "a".repeat(64)
    const token = await state.putSecretState(prefix, { userId, binding })
    expect(await state.consumeBoundSecretState(prefix, token, "b".repeat(64))).toBeNull()
    const results = await Promise.all(Array.from({ length: 10 }, () => state.consumeBoundSecretState(prefix, token, binding)))
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it("rejects address lists and permits a normal mailbox", () => {
    expect(otp.parseMailbox("test@example.com, other@example.com")).toBeNull()
    expect(otp.parseMailbox("Name <test@example.com>")).toBeNull()
    expect(otp.parseMailbox("test@example.com\r\nBcc: other@example.com")).toBeNull()
    expect(otp.parseMailbox(" Test@Example.com ")).toBe("test@example.com")
  })

  it("allows only one successful consumption of the same OTP", async () => {
    const email = `${prefix}-otp@example.com`
    const code = await otp.issueOtp(email, prefix)
    expect(code).toMatch(/^\d{6}$/)
    const results = await Promise.all(Array.from({ length: 10 }, () => otp.consumeOtp(email, code!)))
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it("does not reset guess limits when another code is issued", async () => {
    const email = `${prefix}-guess@example.com`
    const first = await otp.issueOtp(email, `${prefix}-guess`)
    expect(first).toBeTruthy()
    const results = await Promise.all(Array.from({ length: 15 }, () => otp.consumeOtp(email, "invalid")))
    expect(results.every(x => !x)).toBe(true)
    const next = await otp.issueOtp(email, `${prefix}-guess`)
    expect(next).toBeTruthy()
    expect(await otp.consumeOtp(email, next!)).toBe(false)
  })

  it("indexes legacy double encodings without changing JSON, then makes revocation final", async () => {
    const double = Buffer.from(id).toString("base64url")
    const record = { credentialID: double, credentialPublicKey: Buffer.from("test-public-key").toString("base64url"), counter: 0 }
    await prisma.user.update({ where: { id: userId }, data: { passkeys: [record] } })
    const indexed = await prisma.$transaction(tx => passkeys.indexLegacyPasskey(tx, userId, record))
    await prisma.$transaction(tx => passkeys.indexLegacyPasskey(tx, userId, record))
    expect(await prisma.passkeyCredential.count({ where: { userId } })).toBe(1)
    const alias = await prisma.passkeyCredentialAlias.findUnique({ where: { id } })
    expect(alias?.credentialId).toBe(indexed.id)
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.passkeys).toEqual([record])
    // Repeating backfill must detect old-code writes or damaged aliases, not certify drift.
    await prisma.passkeyCredential.update({ where: { id: indexed.id }, data: { counter: 1n } })
    await expect(prisma.$transaction(tx => passkeys.indexLegacyPasskey(tx, userId, record)))
      .rejects.toThrow(/mismatch/)
    await prisma.passkeyCredential.update({ where: { id: indexed.id }, data: { counter: 0n } })
    await prisma.passkeyCredentialAlias.delete({ where: { id } })
    await expect(prisma.$transaction(tx => passkeys.indexLegacyPasskey(tx, userId, record)))
      .rejects.toThrow(/aliases mismatch/)
    await prisma.passkeyCredentialAlias.create({ data: { id, credentialId: indexed.id } })
    await passkeys.revokePasskey(userId, double)
    await expect(passkeys.commitPasskeyAuthentication(indexed.id, userId, 0, 1, async () => "should-not-issue"))
      .rejects.toThrow(/revoked/)
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.passkeys).toEqual([])
    await expect(prisma.$transaction(tx => passkeys.indexLegacyPasskey(tx, userId, record)))
      .rejects.toThrow(/revoked/)
  })
})
