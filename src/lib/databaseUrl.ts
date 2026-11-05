export function verifiedDatabaseUrl(value: string): string {
  const url = new URL(value)
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Invalid database protocol")
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (!local) {
    url.searchParams.delete("uselibpqcompat")
    url.searchParams.set("sslmode", "verify-full")
  }
  return url.toString()
}
