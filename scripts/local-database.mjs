// Shared by the local runner and browser tests; importing this module has no side effects.
export function localDatabaseUrl(value) {
  let url
  try {
    url = new URL(value ?? "")
  } catch {
    throw new Error("Set GRH_TEST_DATABASE_URL to a named loopback PostgreSQL database.")
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.pathname ||
    url.pathname === "/" ||
    url.hash
  ) {
    throw new Error("GRH_TEST_DATABASE_URL must name a loopback PostgreSQL database.")
  }
  for (const [key, value] of url.searchParams) {
    if (key !== "sslmode" || value !== "disable") {
      throw new Error("Local mode refuses database connection URL overrides.")
    }
  }
  url.search = ""
  return url.toString()
}
