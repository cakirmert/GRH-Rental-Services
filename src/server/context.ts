// src/server/context.ts
import { auth } from "../../auth"
import prisma from "@/lib/prismadb"
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch"
import { setupNotificationListener } from "./notificationListener"

// Initialize notification listener once
setupNotificationListener()

export async function createContext(opts: FetchCreateContextFnOptions) {
  // This will read your NextAuth cookies and return a full Session or null
  const session = await auth()

  return {
    req: opts.req,
    prisma,
    session,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
