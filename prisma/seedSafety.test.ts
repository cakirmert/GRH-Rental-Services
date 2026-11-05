import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { localSeedDatabaseUrl } from "./seedSafety"

const local = "postgresql://seed:example-password@127.0.0.1:55432/local_seed"

describe("local seed reset safety", () => {
  it.each([undefined, "", "false", "TRUE", "1"])("requires an explicit true flag (%s)", (flag) => {
    expect(() =>
      localSeedDatabaseUrl({ DATABASE_URL: local, GRH_ALLOW_LOCAL_SEED_RESET: flag }),
    ).toThrow("GRH_ALLOW_LOCAL_SEED_RESET=true")
  })

  it.each([
    "postgresql://user:password@database.example.com/app",
    "postgresql://user:password@127.0.0.1.example.com/app",
    "postgresql://user:password@10.0.0.1/app",
    "https://localhost/app",
    "postgresql://localhost/",
    "not a connection URL",
    "",
  ])("rejects a non-loopback or invalid target", (DATABASE_URL) => {
    expect(() =>
      localSeedDatabaseUrl({ DATABASE_URL, GRH_ALLOW_LOCAL_SEED_RESET: "true" }),
    ).toThrow()
  })

  it.each(["host=database.example.com", "hostaddr=192.0.2.1", "port=5432", "sslmode=require"])(
    "rejects connection overrides: %s",
    (query) => {
      expect(() =>
        localSeedDatabaseUrl({
          DATABASE_URL: `${local}?${query}`,
          GRH_ALLOW_LOCAL_SEED_RESET: "true",
        }),
      ).toThrow("connection URL overrides")
    },
  )

  it.each(["localhost", "127.0.0.1", "[::1]"])("permits opted-in loopback %s", (host) => {
    expect(
      localSeedDatabaseUrl({
        DATABASE_URL: `postgresql://seed:password@${host}:55432/local_seed?sslmode=disable`,
        GRH_ALLOW_LOCAL_SEED_RESET: "true",
      }),
    ).toBe(`postgresql://seed:password@${host}:55432/local_seed`)
  })

  it("rejects the real seed entry point before trying a database connection", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://seed:never-print-this@127.0.0.1:1/seed_guard_test",
        GRH_ALLOW_LOCAL_SEED_RESET: "false",
      },
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("GRH_ALLOW_LOCAL_SEED_RESET=true")
    expect(result.stderr).not.toContain("never-print-this")
    expect(result.stderr).not.toContain("ECONNREFUSED")
  })
})
