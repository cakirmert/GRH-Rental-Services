// src/utils/trpc.ts
import { createTRPCReact } from "@trpc/react-query"
import { httpBatchLink, httpSubscriptionLink, splitLink } from "@trpc/client"
import superjson from "superjson"
import type { AppRouter } from "@/server/routers/_app"

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: "/api/trpc",
        transformer: superjson,
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: (input, init?) =>
          fetch(input as RequestInfo, {
            ...init,
            credentials: "include",
          }),
      }),
    }),
  ],
})
