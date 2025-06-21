// src/app/api/trpc/route.ts
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { appRouter } from "@/server/routers/appRouter"
import { createContext } from "@/server/context"

const ENDPOINT = "/api/trpc" // ← whatever path you mount this at

export const GET = (req: Request) =>
  fetchRequestHandler({
    req,
    endpoint: ENDPOINT,
    router: appRouter,
    createContext,
  })

export const POST = GET
