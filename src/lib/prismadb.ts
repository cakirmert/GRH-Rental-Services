import { PrismaClient } from "@prisma/client"
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { verifiedDatabaseUrl } from "./databaseUrl"

declare global {
  var prisma: PrismaClient | undefined
}

function createClient() {
  const pool = new Pool({
    connectionString: verifiedDatabaseUrl(process.env.DATABASE_URL!),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

const client = globalThis.prisma || createClient()
globalThis.prisma = client
export default client
