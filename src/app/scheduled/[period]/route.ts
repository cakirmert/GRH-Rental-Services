import type { NextRequest } from "next/server"
import { authorizeCronRequest } from "@/app/api/cron/utils"

// Vercel invokes an immutable deployment URL. Run maintenance on the release
// currently serving the production domain, including when promotions overlap.
const productionOrigin = "https://grh-rentals.de"

export async function GET(req: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params
  if (period !== "morning" && period !== "evening") return new Response(null, { status: 404 })
  if (req.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } })
  if (process.env.VERCEL_ENV !== "production") return new Response(null, { status: 403 })
  const denied = authorizeCronRequest(req)
  if (denied) return denied

  const result = await fetch(`${productionOrigin}/api/cron/${period}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: "no-store",
    redirect: "error",
  })
  return new Response(result.body, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": result.headers.get("content-type") ?? "text/plain",
    },
  })
}
