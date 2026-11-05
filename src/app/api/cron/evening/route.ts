"use server"

import type { NextRequest } from "next/server"
import { authorizeCronRequest, runCronTasks } from "../utils"
import { markUpcomingBookingsBorrowed } from "@/server/jobs/autoBorrowed"
import { cancelExpiredBookings } from "@/server/jobs/cancelExpiredBookings"
import { deleteInactiveUsers } from "@/server/jobs/deleteInactiveUsers"
import { autoCompleteBorrowedBookings } from "@/server/jobs/autoCompleteBookings"
import { cleanExpiredAuthState } from "@/lib/auth/state"

export async function GET(req: NextRequest) {
  const authResponse = authorizeCronRequest(req)
  if (authResponse) return authResponse

  const result = await runCronTasks([
    { name: "cleanExpiredAuthState", execute: cleanExpiredAuthState },
    { name: "markUpcomingBookingsBorrowed", execute: markUpcomingBookingsBorrowed },
    { name: "cancelExpiredBookings", execute: cancelExpiredBookings },
    { name: "autoCompleteBorrowedBookings", execute: autoCompleteBorrowedBookings },
    { name: "deleteInactiveUsers", execute: deleteInactiveUsers },
  ])

  return Response.json(result, { status: result.ok ? 200 : 500 })
}
