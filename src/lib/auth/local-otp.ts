/** Console OTPs are permitted only in the explicitly isolated local website runner. */
export function localOtpLoggingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.GRH_LOCAL_TEST !== "true" || env.DISABLE_OUTBOUND !== "true") return false
  if ([env.VERCEL, env.VERCEL_ENV, env.VERCEL_TARGET_ENV, env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].some(Boolean)) {
    return false
  }
  if (env.RP_ID !== "localhost") return false
  try {
    const database = new URL(env.DATABASE_URL ?? "")
    // pg accepts host overrides in query parameters. The local runner removes its allowed sslmode.
    if (!["postgres:", "postgresql:"].includes(database.protocol) ||
        !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
        !database.pathname || database.pathname === "/" || database.search || database.hash) return false

    const origin = new URL(env.ORIGIN ?? "")
    return ["http:", "https:"].includes(origin.protocol) && origin.hostname === "localhost" &&
      !origin.username && !origin.password && origin.origin === env.ORIGIN
  } catch {
    return false
  }
}
