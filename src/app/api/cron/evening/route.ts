"use server"

import type { NextRequest } from "next/server"
import { authorizeCronRequest, runCronTasks } from "../utils"
import { markUpcomingBookingsBorrowed } from "@/server/jobs/autoBorrowed"
import { cancelExpiredBookings } from "@/server/jobs/cancelExpiredBookings"
import { cleanExpiredAuthState } from "@/lib/auth/state"
import { cleanExpiredAuthRecords } from "@/server/jobs/cleanExpiredAuthRecords"
import { deleteInactiveUsers } from "@/server/jobs/deleteInactiveUsers"
import { cleanOrphanLogs } from "@/server/jobs/cleanOrphanLogs"

export async function GET(req: NextRequest) {
  const authResponse = authorizeCronRequest(req)
  if (authResponse) return authResponse

  const result = await runCronTasks([
    { name: "cleanExpiredAuthState", execute: cleanExpiredAuthState },
    { name: "cleanExpiredAuthRecords", execute: cleanExpiredAuthRecords },
    { name: "markUpcomingBookingsBorrowed", execute: markUpcomingBookingsBorrowed },
    { name: "cancelExpiredBookings", execute: cancelExpiredBookings },
    { name: "deleteInactiveUsers", execute: deleteInactiveUsers },
    { name: "cleanOrphanLogs", execute: cleanOrphanLogs },
  ])

  return Response.json(result, { status: result.ok ? 200 : 500 })
}
