import type { NextRequest } from "next/server"

type CronTask = {
  name: string
  execute: () => Promise<unknown>
}

export function authorizeCronRequest(req: NextRequest): Response | null {
  if (process.env.VERCEL_ENV === "preview" || process.env.DISABLE_OUTBOUND === "true") {
    return new Response("Scheduled jobs disabled in this environment", { status: 403 })
  }
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    console.warn("[cron] No CRON_SECRET set; denying request by default.")
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
  const results: Array<{
    name: string
    status: "ok" | "error"
    durationMs: number
    counts?: Record<string, number>
    error?: string
  }> = []

  for (const task of tasks) {
    const startedAt = Date.now()
    try {
      const value = await task.execute()
      // Keep operational evidence without copying account IDs, messages, or
      // arbitrary task return values into hosting logs.
      const counts =
        value && typeof value === "object" && !Array.isArray(value)
          ? (Object.fromEntries(
              Object.entries(value).filter(
                ([key, count]) =>
                  /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(key) &&
                  typeof count === "number" &&
                  Number.isSafeInteger(count) &&
                  count >= 0,
              ),
            ) as Record<string, number>)
          : undefined
      const result = {
        name: task.name,
        status: "ok" as const,
        durationMs: Date.now() - startedAt,
        ...(counts && Object.keys(counts).length ? { counts } : {}),
      }
      results.push(result)
      console.info("[cron]", JSON.stringify({ ...result, finishedAt: new Date().toISOString() }))
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string" &&
        /^[A-Z0-9_]{1,32}$/.test(error.code)
          ? error.code
          : "TASK_FAILED"
      const result = {
        name: task.name,
        status: "error" as const,
        durationMs: Date.now() - startedAt,
        error: code,
      }
      console.error("[cron]", JSON.stringify({ ...result, finishedAt: new Date().toISOString() }))
      results.push(result)
    }
  }

  const hasErrors = results.some((result) => result.status === "error")

  return {
    ok: !hasErrors,
    finishedAt: new Date().toISOString(),
    results,
  }
}
