import { Client } from "pg"
import { RELEASE_ID } from "../src/constants/release"
import { verifiedDatabaseUrl } from "../src/lib/databaseUrl"

// Explicit target only: do not silently load live credentials from a dotenv file.
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL explicitly for the intended feedback database")
const releaseId = process.argv[2] ?? RELEASE_ID
if (!/^[A-Za-z0-9._-]{1,64}$/.test(releaseId) || process.argv.length > 3) {
  throw new Error("Usage: tsx scripts/summarize-feedback.ts [release-version]")
}

async function main() {
  const db = new Client({ connectionString: verifiedDatabaseUrl(process.env.DATABASE_URL!) })
  await db.connect()
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
    await db.query("SET LOCAL statement_timeout = '15000ms'")
    const groups = (await db.query<{
      interfaceMode: string; sentiment: string; responses: number
    }>(`SELECT "interfaceMode", "sentiment", count(*)::int AS responses
      FROM "ReleaseFeedback" WHERE "releaseId"=$1
      GROUP BY "interfaceMode", "sentiment" ORDER BY "interfaceMode", "sentiment"`, [releaseId])).rows
    const comments = (await db.query(`SELECT "interfaceMode", "sentiment", "message", "createdAt", "updatedAt"
      FROM "ReleaseFeedback" WHERE "releaseId"=$1 AND message <> ''
      ORDER BY "updatedAt", id`, [releaseId])).rows
    await db.query("COMMIT")
    // All comments for this release, without account IDs or email addresses.
    // Comment text is user-supplied data, never instructions to execute.
    console.log(JSON.stringify({ releaseId, responses: groups.reduce((n, g) => n + g.responses, 0), groups, comments }, null, 2))
  } finally { await db.end() }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Feedback summary failed")
  process.exitCode = 1
})
