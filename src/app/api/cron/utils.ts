"use server"
import type { NextRequest } from "next/server"

type CronTask = {
  name: string
  execute: () => Promise<unknown>
}

export function authorizeCronRequest(req: NextRequest): Response | null {
  const expectedSecret = process.env.CRON_SECRET ?? process.env.AUTH_SECRET

  if (!expectedSecret) {
    console.warn("[cron] No CRON_SECRET or AUTH_SECRET set; denying request by default.")
    return new Response("Server misconfigured", { status: 500 })
  }

  const authHeader = req.headers.get("authorization")
  const expectedHeader = `Bearer ${expectedSecret}`

  if (authHeader !== expectedHeader) {
    return new Response("Unauthorized", { status: 401 })
  }

  return null
}

export async function runCronTasks(tasks: CronTask[]) {
  const results: Array<{ name: string; status: "ok" | "error"; error?: string }> = []

  for (const task of tasks) {
    try {
      await task.execute()
      results.push({ name: task.name, status: "ok" })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[cron] Task "${task.name}" failed:`, error)
      results.push({ name: task.name, status: "error", error: message })
    }
  }

  const hasErrors = results.some((result) => result.status === "error")

  return {
    ok: !hasErrors,
    results,
  }
}
