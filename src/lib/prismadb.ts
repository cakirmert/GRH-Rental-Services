import { PrismaClient } from "@prisma/client"

declare global {
  // allow global `var` declarations
  var prisma: PrismaClient | undefined
}

const client = globalThis.prisma || new PrismaClient()
if (process.env.NODE_ENV !== "production") globalThis.prisma = client

export default client
