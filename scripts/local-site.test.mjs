// @vitest-environment node
import { describe, expect, it } from "vitest"
import { localDatabaseUrl, localEnvironment, localImageOrigin } from "./local-site.mjs"

const localUrl = "postgresql://test:local-password@127.0.0.1:55432/local_test"
const secret = "a-stable-test-only-auth-secret-with-32-characters"
const local = { GRH_TEST_DATABASE_URL: localUrl, GRH_TEST_AUTH_SECRET: secret }

describe("local website runner", () => {
  it.each([
    "http://images.example.com",
    "https://user:password@images.example.com",
    "https://images.example.com/catalog",
    "https://images.example.com?token=secret",
    "https://images.example.com#fragment",
    "https://images.example.com?",
    "https://images.example.com:8443",
    "not an origin",
  ])("rejects invalid image origin %s", (value) => {
    expect(() => localImageOrigin(value)).toThrow("HTTPS origin")
  })

  it("permits only the explicitly selected public image origin while disabling uploads", () => {
    const fromFile = localEnvironment(
      { ...local, GRH_TEST_IMAGE_ORIGIN: "https://images.example.com/" },
      {},
      "build",
    )
    expect(fromFile.BLOB_URL_BASE).toBe("https://images.example.com")
    expect(fromFile.BLOB_READ_WRITE_TOKEN).toBe("")
    expect(fromFile.DISABLE_OUTBOUND).toBe("true")
    const overridden = localEnvironment(
      { ...local, GRH_TEST_IMAGE_ORIGIN: "https://images.example.com" },
      {
        GRH_TEST_IMAGE_ORIGIN: "https://other-images.example.com",
        BLOB_URL_BASE: "https://inherited-live.example.com",
      },
      "start",
    )
    expect(overridden.BLOB_URL_BASE).toBe("https://other-images.example.com")
    expect(
      localEnvironment(local, { BLOB_URL_BASE: "https://inherited-live.example.com" }, "check")
        .BLOB_URL_BASE,
    ).toBe("")
  })

  it.each([
    "postgresql://remote.example.com/live",
    "postgresql://127.0.0.1.example.com/live",
    "postgresql://10.0.0.1/live",
    "https://localhost/local_test",
    "postgresql://localhost/",
    `${localUrl}?host=remote.example.com`,
    `${localUrl}?%68ost=remote.example.com`,
    `${localUrl}?host=localhost&host=remote.example.com`,
    `${localUrl}?hostaddr=192.0.2.1`,
    `${localUrl}?sslmode=disable&host=remote.example.com`,
    `${localUrl}?options=-csearch_path=another_schema`,
  ])("refuses unsafe database targets without echoing credentials", (url) => {
    expect(() => localDatabaseUrl(url)).toThrow()
    try {
      localDatabaseUrl(url)
    } catch (error) {
      expect(error.message).not.toContain("local-password")
    }
  })

  it.each(["localhost", "127.0.0.1", "[::1]"])("supports loopback %s", (host) => {
    expect(localDatabaseUrl(`postgresql://${host}/local_test?sslmode=disable`)).toBe(
      `postgresql://${host}/local_test`,
    )
  })

  it("requires dedicated test configuration and does not fall back to live credentials", () => {
    expect(() =>
      localEnvironment({}, { DATABASE_URL: localUrl, AUTH_SECRET: secret }, "check"),
    ).toThrow("GRH_TEST_DATABASE_URL")
    expect(() =>
      localEnvironment({ GRH_TEST_DATABASE_URL: localUrl }, { AUTH_SECRET: secret }, "check"),
    ).toThrow("GRH_TEST_AUTH_SECRET")
  })

  it("allows only explicit GRH_TEST overrides and keeps live secrets out of children", () => {
    const env = localEnvironment(
      { ...local, BLOB_READ_WRITE_TOKEN: "file-live-token" },
      {
        GRH_TEST_DATABASE_URL: "postgresql://localhost/explicit_local_test",
        GRH_TEST_AUTH_SECRET: secret + "-override",
        DATABASE_URL: "postgresql://live.example.com/production",
        AUTH_SECRET: "live-auth-secret",
        BLOB_READ_WRITE_TOKEN: "live-blob-token",
        EMAIL_PASSWORD: "live-mail-password",
        VAPID_PRIVATE_KEY: "live-push-key",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "live-captcha-key",
        VERCEL_TOKEN: "live-vercel-token",
        OTHER_SECRET: "another-secret",
        NODE_OPTIONS: "--require unwanted-file.js",
        HTTPS_PROXY: "http://unwanted.example.com",
        PATH: "/tools",
      },
      "build",
    )
    expect(env.DATABASE_URL).toBe("postgresql://localhost/explicit_local_test")
    expect(env.TEST_DATABASE_URL).toBe(env.DATABASE_URL)
    expect(env.GRH_TEST_DATABASE_URL).toBe(env.DATABASE_URL)
    expect(env.AUTH_SECRET).toBe(secret + "-override")
    expect(env.PATH).toBe("/tools")
    expect(env.__NEXT_PROCESSED_ENV).toBe("true")
    expect(env.DISABLE_OUTBOUND).toBe("true")
    expect(env.GRH_LOCAL_TEST).toBe("true")
    for (const key of [
      "BLOB_READ_WRITE_TOKEN",
      "EMAIL_PASSWORD",
      "VAPID_PRIVATE_KEY",
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
      "TURNSTILE_SECRET_KEY",
    ]) {
      expect(env[key]).toBe("")
    }
    for (const key of ["VERCEL_TOKEN", "OTHER_SECRET", "NODE_OPTIONS", "HTTPS_PROXY"]) {
      expect(env[key]).toBeUndefined()
    }
  })

  it.each(["build", "start", "dev", "test", "e2e", "check"])(
    "keeps auth and origin stable for %s",
    (mode) => {
      const env = localEnvironment(local, {}, mode)
      expect(env.AUTH_SECRET).toBe(secret)
      expect(env.AUTH_TRUST_HOST).toBe("true")
      expect(env.AUTH_URL).toBe("http://localhost:3100")
      expect(env.NEXTAUTH_URL).toBe(env.AUTH_URL)
      expect(env.ORIGIN).toBe(env.AUTH_URL)
      expect(env.RP_ID).toBe("localhost")
      expect(env.GRH_LOCAL_TEST).toBe("true")
    },
  )

  it.each([
    ["VERCEL", "1"],
    ["VERCEL_ENV", "production"],
    ["VERCEL_ENV", "preview"],
    ["VERCEL_TARGET_ENV", "staging"],
    ["VERCEL_URL", "deployment.vercel.app"],
    ["VERCEL_PROJECT_PRODUCTION_URL", "production.vercel.app"],
  ])("refuses to conceal hosted metadata %s", (name, value) => {
    expect(() => localEnvironment(local, { [name]: value }, "start")).toThrow("Vercel deployment")
  })

  it("refuses arbitrary commands and short secrets", () => {
    expect(() => localEnvironment(local, {}, "seed")).toThrow("Choose a local command")
    expect(() =>
      localEnvironment({ ...local, GRH_TEST_AUTH_SECRET: "short" }, {}, "check"),
    ).toThrow("at least 32")
  })
})
