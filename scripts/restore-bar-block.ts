import {
  BLOCK_TIME_ZONE,
  parseBerlinDateTime,
  validateBlockRecurrence,
} from "../src/lib/recurring-blocks"
import { bookingTransaction } from "../src/server/bookingSecurity"
import { assertBlockPreservesBookings } from "../src/server/recurringBlocks"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { verifiedDatabaseUrl } from "../src/lib/databaseUrl"

// Reviewed release data, confirmed by the owner on 6 November 2026.
// This does not load dotenv files or run as part of a build/migration.
const blockId = "release-20261106-bar-weekly"
const itemId = "cmbtxk46f0001550sym1bgf2q"

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL explicitly for the intended database.")
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    throw new Error("Usage: tsx scripts/restore-bar-block.ts [--apply]")
  }
  const apply = args[0] === "--apply"
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: verifiedDatabaseUrl(process.env.DATABASE_URL),
      connectionTimeoutMillis: 10000,
    }),
  })
  try {
    const result = await bookingTransaction(db, async (tx) => {
      if (!apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`
      const item = await tx.item.findUnique({
        where: { id: itemId },
        select: { titleEn: true, active: true, totalQuantity: true },
      })
      if (!item || item.titleEn !== "Bar" || !item.active) {
        throw new Error("The expected active Bar item was not found; nothing changed.")
      }
      const existing = await tx.recurringBlock.findUnique({ where: { id: blockId } })
      if (existing) {
        if (existing.itemId !== itemId)
          throw new Error("Unexpected release block identifier; nothing changed.")
        return { status: "already present", existingSchedulePreserved: true }
      }
      // Do not introduce a second indefinite weekly schedule if staff restored it first.
      const duplicate = await tx.recurringBlock.findFirst({
        where: { itemId, frequency: "WEEKLY", until: null, stoppedFrom: null },
      })
      if (duplicate)
        throw new Error(
          "An indefinite weekly Bar block already exists; review it before restoring another.",
        )
      const data = {
        id: blockId,
        itemId,
        startDate: parseBerlinDateTime("2026-11-06T14:00"),
        endDate: parseBerlinDateTime("2026-11-07T14:00"),
        frequency: "WEEKLY",
        timeZone: BLOCK_TIME_ZONE,
        quantity: item.totalQuantity,
        reason: "Blocked for weekly parties.",
      }
      validateBlockRecurrence(data)
      await assertBlockPreservesBookings(tx, itemId, item.totalQuantity, data)
      if (apply) await tx.recurringBlock.create({ data })
      return {
        status: apply ? "restored" : "dry run passed",
        schedule: "Friday 14:00 to Saturday 14:00",
        timeZone: BLOCK_TIME_ZONE,
        repeatUntil: null,
      }
    })
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
      "This block would conflict",
      "Too many",
      "The booking changed",
    ].some((prefix) => error.message.startsWith(prefix))
  console.error(
    safe ? error.message : "Bar block restoration failed; no partial changes were committed.",
  )
  process.exitCode = 1
})
