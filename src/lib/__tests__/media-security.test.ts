// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET, HEAD } from "@/app/api/edgeImage/route"
import { verifiedDatabaseUrl } from "../databaseUrl"

afterEach(() => vi.unstubAllEnvs())

describe("legacy image route isolation", () => {
  it("rejects other tenants and never fetches their content", () => {
    vi.stubEnv("BLOB_URL_BASE", "https://owned.public.blob.vercel-storage.com")
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    for (const source of [
      "https://attacker.public.blob.vercel-storage.com/payload.html",
      "https://owned.public.blob.vercel-storage.com.evil.test/payload",
      "https://user:password@owned.public.blob.vercel-storage.com/payload",
      "http://owned.public.blob.vercel-storage.com/payload",
    ]) {
      const req = new NextRequest("https://app.test/api/edgeImage?url=" + encodeURIComponent(source))
      expect(GET(req).status).toBe(403)
      expect(HEAD(req).status).toBe(403)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
  it("preserves legitimate legacy links through an external redirect without active response bytes", async () => {
    vi.stubEnv("BLOB_URL_BASE", "https://owned.public.blob.vercel-storage.com")
    const source = "https://owned.public.blob.vercel-storage.com/photo.jpg"
    const res = GET(new NextRequest("https://app.test/api/edgeImage?url=" + encodeURIComponent(source)))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe(source)
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(await res.text()).toBe("")
  })
})

describe("database TLS", () => {
  it("overrides remote downgrade flags with full certificate identity checks", () => {
    const url = new URL(verifiedDatabaseUrl("postgresql://user:secret@db.example/db?sslmode=disable&uselibpqcompat=true"))
    expect(url.searchParams.get("sslmode")).toBe("verify-full")
    expect(url.searchParams.has("uselibpqcompat")).toBe(false)
  })
  it("retains explicit loopback test connections", () => {
    expect(new URL(verifiedDatabaseUrl("postgres://localhost/test?sslmode=disable")).searchParams.get("sslmode")).toBe("disable")
  })
})
