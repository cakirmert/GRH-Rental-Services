import type { NextRequest } from "next/server"
import { runMaintenance } from "@/app/api/cron/runMaintenance"

export async function GET(req: NextRequest, { params }: { params: Promise<{ period: string }> }) {
  const { period } = await params
  if (period !== "morning" && period !== "evening") return new Response(null, { status: 404 })
  if (req.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET" } })
  if (process.env.VERCEL_ENV !== "production") return new Response(null, { status: 403 })
  return runMaintenance(req, period)
}
