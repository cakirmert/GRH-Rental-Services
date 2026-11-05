/** Local seeding deletes all application data. Validate before creating a client. */
export function localSeedDatabaseUrl(env: Record<string, string | undefined>): string {
  if (env.GRH_ALLOW_LOCAL_SEED_RESET !== "true") {
    throw new Error("Local seed reset requires GRH_ALLOW_LOCAL_SEED_RESET=true.")
  }
  let url: URL
  try {
    url = new URL(env.DATABASE_URL ?? "")
  } catch {
    throw new Error("Local seed reset requires a valid loopback PostgreSQL DATABASE_URL.")
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname ||
    url.pathname === "/" ||
    url.hash
  ) {
    throw new Error("Local seed reset is restricted to a named PostgreSQL database on loopback.")
  }
  // node-postgres accepts URL query parameters that override the hostname.
  // A local host in the authority alone therefore does not establish safety.
  for (const [key, value] of url.searchParams) {
    if (key !== "sslmode" || value !== "disable") {
      throw new Error("Local seed reset does not permit connection URL overrides.")
    }
  }
  url.search = ""
  return url.toString()
}
