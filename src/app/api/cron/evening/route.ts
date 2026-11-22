import type { NextRequest } from "next/server"
import { runMaintenance } from "../runMaintenance"

export async function GET(req: NextRequest) {
  return runMaintenance(req, "evening")
}
