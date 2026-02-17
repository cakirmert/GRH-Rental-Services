import { PrismaClient } from "@prisma/client"

declare global {
  // allow global `var` declarations
  var prisma: PrismaClient | undefined
}

const client = globalThis.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})
if (process.env.NODE_ENV !== "production") globalThis.prisma = client

export default client
