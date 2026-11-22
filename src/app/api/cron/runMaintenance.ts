import type { NextRequest } from "next/server"
import { cleanExpiredAuthState } from "@/lib/auth/state"
import { markUpcomingBookingsBorrowed } from "@/server/jobs/autoBorrowed"
import { cancelExpiredBookings } from "@/server/jobs/cancelExpiredBookings"
import { cleanExpiredAuthRecords } from "@/server/jobs/cleanExpiredAuthRecords"
import { deleteOldBookings } from "@/server/jobs/cleanOldBookings"
import { cleanOrphanLogs } from "@/server/jobs/cleanOrphanLogs"
import { deleteInactiveUsers } from "@/server/jobs/deleteInactiveUsers"
import { cleanExpiredProblemReports, processProblemReports } from "@/server/problemReports"
import { authorizeCronRequest, runCronTasks } from "./utils"

const maintenanceTasks = {
  morning: [
    { name: "markUpcomingBookingsBorrowed", execute: markUpcomingBookingsBorrowed },
    { name: "cancelExpiredBookings", execute: cancelExpiredBookings },
    { name: "deleteOldBookings", execute: deleteOldBookings },
    { name: "processProblemReports", execute: processProblemReports },
  ],
  evening: [
    { name: "cleanExpiredAuthState", execute: cleanExpiredAuthState },
    { name: "cleanExpiredAuthRecords", execute: cleanExpiredAuthRecords },
    { name: "markUpcomingBookingsBorrowed", execute: markUpcomingBookingsBorrowed },
    { name: "cancelExpiredBookings", execute: cancelExpiredBookings },
    { name: "deleteInactiveUsers", execute: deleteInactiveUsers },
    { name: "cleanOrphanLogs", execute: cleanOrphanLogs },
    { name: "cleanExpiredProblemReports", execute: cleanExpiredProblemReports },
    { name: "processProblemReports", execute: processProblemReports },
  ],
}

export async function runMaintenance(req: NextRequest, period: keyof typeof maintenanceTasks) {
  const denied = authorizeCronRequest(req)
  if (denied) return denied

  const result = await runCronTasks(maintenanceTasks[period])
  return Response.json(result, {
    status: result.ok ? 200 : 500,
    headers: { "Cache-Control": "no-store" },
  })
}
