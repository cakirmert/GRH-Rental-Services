"use server"

import type { NextRequest } from "next/server"
import { authorizeCronRequest, runCronTasks } from "../utils"
import { markUpcomingBookingsBorrowed } from "@/server/jobs/autoBorrowed"
import { cancelExpiredBookings } from "@/server/jobs/cancelExpiredBookings"
import { deleteOldBookings } from "@/server/jobs/cleanOldBookings"

export async function GET(req: NextRequest) {
  const authResponse = authorizeCronRequest(req)
  if (authResponse) return authResponse

  const result = await runCronTasks([
    { name: "markUpcomingBookingsBorrowed", execute: markUpcomingBookingsBorrowed },
    { name: "cancelExpiredBookings", execute: cancelExpiredBookings },
    { name: "deleteOldBookings", execute: deleteOldBookings },
  ])

  return Response.json(result, { status: result.ok ? 200 : 500 })
}
