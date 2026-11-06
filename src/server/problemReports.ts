import { randomUUID } from "node:crypto"
import type { PrismaClient, ProblemReport } from "@prisma/client"
import prisma from "@/lib/prismadb"

export const REPORT_RETENTION_MS = 30 * 86_400_000
export const REPORT_REPOSITORY = "cakirmert/GRH-Rental-Services"
const API_URL = `https://api.github.com/repos/${REPORT_REPOSITORY}/issues`
const LEASE_MS = 120_000
const LOCK_KEY = "problem-report-delivery-lock"
type Database = PrismaClient
type DeliveryOptions = { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; now?: Date; timeoutMs?: number }

/** No browser, preview, development, or local-test environment may publish reports. */
export function reportDeliveryEnabled(env: NodeJS.ProcessEnv = process.env) {
  const flagsAllow = env.GITHUB_REPORTS_ENABLED === "true" && !!env.GITHUB_ISSUES_TOKEN?.trim() &&
    env.NODE_ENV === "production" && env.VERCEL === "1" && env.VERCEL_ENV === "production" &&
    (!env.VERCEL_TARGET_ENV || env.VERCEL_TARGET_ENV === "production") &&
    env.DISABLE_OUTBOUND !== "true" && env.GRH_LOCAL_TEST !== "true"
  if (!flagsAllow) return false
  try {
    const origin = new URL(env.ORIGIN ?? "")
    const database = new URL(env.DATABASE_URL ?? "")
    // Require a DNS deployment/DB host, excluding every numeric/IPv6 loopback
    // spelling. PostgreSQL URLs preserve case/encoding unlike HTTPS URLs.
    const remoteHost = (host: string) => {
      const canonical = decodeURIComponent(host).toLowerCase().replace(/\.$/, "")
      return /^[a-z0-9](?:[a-z0-9.-]*\.)[a-z]{2,}$/.test(canonical) &&
        !canonical.endsWith(".localhost") && !canonical.endsWith(".local")
    }
    // pg gives connection query parameters precedence over the URL host.
    if ([...database.searchParams.keys()].some(key => !["sslmode", "channel_binding", "uselibpqcompat"].includes(key))) return false
    return origin.protocol === "https:" && remoteHost(origin.hostname) && remoteHost(database.hostname) &&
      ["postgres:", "postgresql:"].includes(database.protocol)
  } catch { return false }
}

export function publicReportResult(report: Pick<ProblemReport, "id" | "status" | "issueNumber">) {
  return {
    id: report.id,
    status: report.status === "PUBLISHED" ? "published" as const :
      report.status === "NEEDS_REVIEW" ? "needs_review" as const : "queued" as const,
    issueUrl: report.status === "PUBLISHED" && report.issueNumber ?
      `https://github.com/${REPORT_REPOSITORY}/issues/${report.issueNumber}` : null,
  }
}

export function githubReportPayload(report: Pick<ProblemReport, "id" | "category" | "title" | "description">) {
  // Every authored line is a code block, so images, HTML, mentions and issue links
  // cannot become active Markdown. The opaque marker contains no account identity.
  const plainText = report.description.replace(/\r\n?/g, "\n").split("\n")
    .map(line => `    ${line}`).join("\n")
  return {
    title: `[${report.category === "problem" ? "Problem" : "Feedback"}] ${report.title
      .replace(/@/g, "@\u200b").replace(/[<>]/g, "").replace(/([\\`*_~[\]])/g, "\\$1")}`,
    body: `Report type: ${report.category}\n\n${plainText}\n\n<!-- grh-report:${report.id} -->`,
  }
}

function issueNumber(value: unknown): number | null {
  if (!value || typeof value !== "object" || !("number" in value)) return null
  return typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0
    ? value.number : null
}

async function boundedJson(response: Response): Promise<unknown> {
  const maximum = 2 * 1024 * 1024
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Missing GitHub response")
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maximum) throw new Error("GitHub response too large")
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

function retryDelay(response: Response, attempts: number, now: Date) {
  const retry = Number(response.headers.get("retry-after"))
  const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000 - now.getTime()
  // Respect GitHub's minimum delay; never retry automatically during a stated cooldown.
  return Math.max(60_000 * 2 ** Math.min(attempts, 8),
    Number.isFinite(retry) && retry > 0 ? retry * 1000 : 0,
    response.headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset) ? reset : 0)
}

/** Persisted lock serializes GitHub requests across function instances. */
async function acquireDeliveryLock(db: Database, token: string) {
  const rows = await db.$queryRaw<Array<{ key: string }>>`
    INSERT INTO "AuthState" ("key", "value", "expiresAt")
    VALUES (${LOCK_KEY}, jsonb_build_object('token', ${token}::text), clock_timestamp() + interval '120 seconds')
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "expiresAt" = EXCLUDED."expiresAt"
    WHERE "AuthState"."expiresAt" <= clock_timestamp() RETURNING "key"`
  return rows.length === 1
}

/**
 * A stale SENDING lease is ambiguous, never permission to send a second POST.
 * GitHub has no create-issue idempotency key. Reconcile using the opaque marker;
 * lack of a match remains NEEDS_REVIEW instead of risking a duplicate issue.
 */
export async function deliverProblemReport(id: string, db: Database = prisma, options: DeliveryOptions = {}) {
  const env = options.env ?? process.env
  if (!reportDeliveryEnabled(env)) return false
  const now = options.now ?? new Date()
  const eligible = (row: ProblemReport | null) => row && row.status !== "PUBLISHED" &&
    row.expiresAt > now && row.nextAttemptAt <= now && (!row.leaseUntil || row.leaseUntil <= now)
  // Duplicate submitted reports must not monopolize the global delivery cooldown.
  if (!eligible(await db.problemReport.findUnique({ where: { id } }))) return false
  const token = randomUUID()
  if (!(await acquireDeliveryLock(db, token))) return false
  let cooldownMs = 0
  try {
    const row = await db.problemReport.findUnique({ where: { id } })
    if (!row || !eligible(row)) return false
    const reconcileOnly = row.status !== "QUEUED"
    const claimed = await db.problemReport.updateMany({
      where: { id, status: row.status, expiresAt: { gt: now }, nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
      data: { status: reconcileOnly ? "NEEDS_REVIEW" : "SENDING", leaseToken: token,
        leaseUntil: new Date(now.getTime() + LEASE_MS), deliveryAttempts: { increment: reconcileOnly ? 0 : 1 } },
    })
    if (!claimed.count) return false

    const finish = async (status: string, code: string | null, delay = 0, number: number | null = null) => {
      await db.problemReport.updateMany({ where: { id, leaseToken: token }, data: {
        status, lastErrorCode: code, issueNumber: number, leaseToken: null, leaseUntil: null,
        nextAttemptAt: new Date(now.getTime() + delay),
      } })
    }
    // Account erasure/expiry can remove a queued report after it was selected.
    // The FK also prevents orphan reports; an already in-flight remote request
    // cannot be atomically recalled and is disclosed as an external copy.
    if (!(await db.problemReport.findFirst({ where: { id, leaseToken: token, expiresAt: { gt: new Date() } }, select: { id: true } }))) return false
    const request = options.fetch ?? fetch
    const headers = {
      Authorization: `Bearer ${env.GITHUB_ISSUES_TOKEN!.trim()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "Content-Type": "application/json",
    }
    // One overall deadline covers pagination as well as the create request.
    const signal = AbortSignal.timeout(Math.max(1, Math.min(options.timeoutMs ?? 8000, 8000)))
    cooldownMs = 1000
    try {
      if (reconcileOnly) {
        const marker = `<!-- grh-report:${id} -->`
        for (let page = 1; page <= 5; page++) {
          const url = new URL(API_URL)
          url.search = new URLSearchParams({ state: "all", sort: "created", direction: "desc",
            since: row.createdAt.toISOString(), per_page: "100", page: String(page) }).toString()
          const response = await request(url, { headers, signal, redirect: "error", cache: "no-store" })
          if (!response.ok) {
            cooldownMs = retryDelay(response, row.deliveryAttempts, now)
            await finish("NEEDS_REVIEW", "RECONCILE_UNAVAILABLE", Math.max(cooldownMs, 3_600_000))
            return true
          }
          const issues = await boundedJson(response)
          if (!Array.isArray(issues)) throw new Error("Invalid issue listing")
          const matching = issues.find(issue => issue && typeof issue === "object" &&
            !("pull_request" in issue) && typeof issue.body === "string" && issue.body.endsWith(marker))
          const number = issueNumber(matching)
          if (number) { await finish("PUBLISHED", null, 0, number); return true }
          if (issues.length < 100) break
        }
        await finish("NEEDS_REVIEW", "DELIVERY_UNCERTAIN", 6 * 3_600_000)
        return true
      }

      const response = await request(API_URL, {
        method: "POST", headers, body: JSON.stringify(githubReportPayload(row)),
        signal, redirect: "error", cache: "no-store",
      })
      if (response.status === 201) {
        const number = issueNumber(await boundedJson(response))
        if (!number) throw new Error("Invalid created issue")
        await finish("PUBLISHED", null, 0, number)
      } else if (response.status === 429 || response.status === 403 &&
          (response.headers.has("retry-after") || response.headers.get("x-ratelimit-remaining") === "0")) {
        cooldownMs = retryDelay(response, row.deliveryAttempts, now)
        await finish(row.deliveryAttempts >= 9 ? "NEEDS_REVIEW" : "QUEUED", "GITHUB_RATE_LIMIT", cooldownMs)
      } else if ([401, 403, 404].includes(response.status)) {
        // A definitive permissions/configuration rejection cannot have created an issue.
        cooldownMs = 6 * 3_600_000
        await finish(row.deliveryAttempts >= 9 ? "NEEDS_REVIEW" : "QUEUED", "GITHUB_CONFIGURATION", cooldownMs)
      } else {
        await finish("NEEDS_REVIEW", "DELIVERY_UNCERTAIN", 60_000)
      }
    } catch {
      // Never log GitHub bodies, authored text, tokens, account data, or raw errors.
      await finish("NEEDS_REVIEW", "DELIVERY_UNCERTAIN", 60_000)
    }
    return true
  } finally {
    await db.$executeRaw`UPDATE "AuthState" SET "expiresAt" = clock_timestamp() + ${cooldownMs} * interval '1 millisecond'
      WHERE "key" = ${LOCK_KEY} AND "value"->>'token' = ${token}`
  }
}

export async function processProblemReports(db: Database = prisma, options: DeliveryOptions = {}) {
  if (!reportDeliveryEnabled(options.env ?? process.env)) return { attempted: 0, skipped: 0 }
  const now = options.now ?? new Date()
  const rows = await db.problemReport.findMany({ where: {
    status: { in: ["QUEUED", "SENDING", "NEEDS_REVIEW"] }, expiresAt: { gt: now }, nextAttemptAt: { lte: now },
    OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
  }, orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }], take: 50, select: { id: true } })
  const deadline = Date.now() + 35_000
  let attempted = 0
  let skipped = 0
  for (const row of rows) {
    const remaining = deadline - Date.now()
    if (remaining < 1000) break
    const claimed = await deliverProblemReport(row.id, db, { ...options, timeoutMs: remaining })
    if (!claimed) { skipped++; break }
    attempted++
    // Keep mutations serial and separated, including across app instances.
    if (attempted < rows.length && Date.now() + 1050 < deadline) await new Promise(resolve => setTimeout(resolve, 1050))
  }
  return { attempted, skipped }
}

export async function cleanExpiredProblemReports(db: Database = prisma) {
  const now = new Date()
  const expired = await db.problemReport.findMany({ where: { expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" }, take: 1000, select: { id: true } })
  const deleted = await db.problemReport.deleteMany({
    where: { id: { in: expired.map(row => row.id) }, expiresAt: { lte: now } },
  })
  return { deleted: deleted.count }
}
