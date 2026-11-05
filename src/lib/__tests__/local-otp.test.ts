// @vitest-environment node
import { describe, expect, it } from "vitest"
import { localOtpLoggingEnabled } from "../auth/local-otp"

const local = {
  NODE_ENV: "production",
  GRH_LOCAL_TEST: "true",
  DISABLE_OUTBOUND: "true",
  DATABASE_URL: "postgresql://test:local-only@127.0.0.1:55432/disposable",
  ORIGIN: "http://localhost:3100",
  RP_ID: "localhost",
} as const

describe("isolated local OTP logging boundary", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])("allows explicit local mode with loopback %s even for a production build", host => {
    expect(localOtpLoggingEnabled({ ...local, DATABASE_URL: `postgresql://${host}/disposable` })).toBe(true)
  })

  it.each([
    { GRH_LOCAL_TEST: undefined }, { GRH_LOCAL_TEST: "false" }, { GRH_LOCAL_TEST: "TRUE" },
    { DISABLE_OUTBOUND: undefined }, { DISABLE_OUTBOUND: "false" },
    { VERCEL: "1" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" },
    { VERCEL_TARGET_ENV: "staging" }, { VERCEL_URL: "deployment.vercel.app" },
    { VERCEL_PROJECT_PRODUCTION_URL: "production.vercel.app" },
    { DATABASE_URL: undefined }, { DATABASE_URL: "not a connection string" },
    { DATABASE_URL: "postgresql://remote.example.com/production" },
    { DATABASE_URL: "postgresql://localhost.example.com/production" },
    { DATABASE_URL: "https://localhost/disposable" }, { DATABASE_URL: "postgresql://localhost/" },
    { DATABASE_URL: "postgresql://localhost/disposable#fragment" },
    { DATABASE_URL: "postgresql://localhost/disposable?host=remote.example.com" },
    { DATABASE_URL: "postgresql://localhost/disposable?%68ost=remote.example.com" },
    { DATABASE_URL: "postgresql://localhost/disposable?host=localhost&host=remote.example.com" },
    { DATABASE_URL: "postgresql://localhost/disposable?hostaddr=192.0.2.1" },
    { DATABASE_URL: "postgresql://localhost/disposable?sslmode=disable" },
    { ORIGIN: undefined }, { ORIGIN: "not an origin" },
    { ORIGIN: "https://example.com" }, { ORIGIN: "http://localhost:3100/path" },
    { ORIGIN: "http://user:password@localhost:3100" }, { ORIGIN: "http://localhost:3100?host=remote" },
    { ORIGIN: "http://localhost:3100#fragment" }, { RP_ID: "example.com" }, { RP_ID: undefined },
  ])("fails closed for an ineligible environment: %j", override => {
    expect(localOtpLoggingEnabled({ ...local, ...override })).toBe(false)
  })

  it("does not enable logging for an ordinary development environment", () => {
    expect(localOtpLoggingEnabled({ NODE_ENV: "development", DATABASE_URL: local.DATABASE_URL })).toBe(false)
  })
})
