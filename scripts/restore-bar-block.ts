import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { verifiedDatabaseUrl } from "../src/lib/databaseUrl"
import { restoreWeeklyBarBlock } from "./bar-restoration"

// Reviewed release data, confirmed by the owner on 6 November 2026.
// This does not load dotenv files or run as part of a build/migration.
const blockId = "release-20261106-bar-weekly"
const itemId = "cmbtxk46f0001550sym1bgf2q"

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL explicitly for the intended database.")
  const args = process.argv.slice(2)
  let apply = false
  let preserveBookingId: string | undefined
  const usage = () =>
    new Error("Usage: tsx scripts/restore-bar-block.ts [--apply] [--preserve-booking ID]")
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--apply" && !apply) apply = true
    else if (args[index] === "--preserve-booking" && !preserveBookingId) {
      preserveBookingId = args[++index]
      if (!preserveBookingId || !/^[a-zA-Z0-9_-]{1,128}$/.test(preserveBookingId)) throw usage()
    } else throw usage()
  }
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: verifiedDatabaseUrl(process.env.DATABASE_URL),
      connectionTimeoutMillis: 10000,
    }),
  })
  try {
    const result = await restoreWeeklyBarBlock(db, { itemId, blockId, apply, preserveBookingId })
    console.log(JSON.stringify(result))
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  // Avoid printing database connection details or query metadata on infrastructure errors.
  const safe =
    error instanceof Error &&
    [
      "Set DATABASE_URL",
      "Usage:",
      "The expected active Bar",
      "Unexpected release block",
      "An indefinite weekly Bar",
      "The selected booking",
      "This block would conflict",
      "Too many",
      "The booking changed",
    ].some((prefix) => error.message.startsWith(prefix))
  console.error(
    safe ? error.message : "Bar block restoration failed; no partial changes were committed.",
  )
  process.exitCode = 1
})
