import { PrismaClient } from "@prisma/client"

declare global {
  // allow global `var` declarations
  var prisma: PrismaClient | undefined
}

import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = `${process.env.DATABASE_URL}`

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)

const client = globalThis.prisma || new PrismaClient({ adapter })
if (process.env.NODE_ENV !== "production") globalThis.prisma = client

export default client
