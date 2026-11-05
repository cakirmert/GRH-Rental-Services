import { createHash } from "node:crypto"
import { config } from "dotenv"

// Explicit target; never silently load a production .env file for a migration.
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL explicitly for the intended migration target")
config({ path: ".env", quiet: true, override: false })

async function main() {
  const { default: prisma } = await import("../src/lib/prismadb")
  const { indexLegacyPasskey, lockPasskeyUser } = await import("../src/lib/auth/passkey-store")
  try {
    const before = await prisma.user.findMany({ select: { id: true, passkeys: true }, orderBy: { id: "asc" } })
    const snapshotDigest = (rows: unknown) => createHash("sha256").update(JSON.stringify(rows)).digest("hex")
    const beforeDigest = snapshotDigest(before)
    let credentials = 0
    // A single transaction prevents a partial migration on any malformed/colliding record.
    await prisma.$transaction(async tx => {
      for (const user of before) {
        const current = await lockPasskeyUser(tx, user.id)
        if (JSON.stringify(current) !== JSON.stringify(user.passkeys)) {
          throw new Error("Passkey data changed during backfill; retry from a fresh snapshot")
        }
        const seen = new Set<string>()
        for (const value of current) {
          if (seen.has(value.credentialID)) throw new Error("Duplicate legacy credential; manual reconciliation required")
          seen.add(value.credentialID)
          await indexLegacyPasskey(tx, user.id, value)
          credentials++
        }
      }
    }, { timeout: 120_000 })
    const after = await prisma.user.findMany({ select: { id: true, passkeys: true }, orderBy: { id: "asc" } })
    const afterDigest = snapshotDigest(after)
    if (beforeDigest !== afterDigest) throw new Error("Legacy data changed during verification; investigate before cutover")
    const indexed = await prisma.passkeyCredential.count({ where: { revokedAt: null } })
    if (indexed !== credentials) throw new Error("Active index count differs from legacy credential count; investigate before cutover")
    console.log(JSON.stringify({ users: before.length, credentials, indexed, legacyUnchanged: true, sha256: beforeDigest }))
  } finally { await prisma.$disconnect() }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Passkey backfill failed")
  process.exitCode = 1
})
