import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseEnv } from "node:util"
import { localDatabaseUrl } from "./local-database.mjs"

export { localDatabaseUrl } from "./local-database.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const require = createRequire(import.meta.url)
const modes = ["build", "start", "dev", "test", "e2e", "check"]
const origin = "http://localhost:3100"

export function localImageOrigin(value) {
  if (!value) return ""
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error("GRH_TEST_IMAGE_ORIGIN must be an HTTPS origin without a path or credentials.")
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (value !== url.origin && value !== `${url.origin}/`)
  ) {
    throw new Error("GRH_TEST_IMAGE_ORIGIN must be an HTTPS origin without a path or credentials.")
  }
  return url.origin
}

export function localEnvironment(fileValues, inherited, mode) {
  if (!modes.includes(mode)) throw new Error(`Choose a local command: ${modes.join(", ")}.`)
  if (["VERCEL", "VERCEL_ENV", "VERCEL_TARGET_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"].some(name => inherited[name])) {
    throw new Error("Local test mode cannot run in a Vercel deployment environment.")
  }
  const databaseUrl = localDatabaseUrl(
    inherited.GRH_TEST_DATABASE_URL ?? fileValues.GRH_TEST_DATABASE_URL,
  )
  const secret = inherited.GRH_TEST_AUTH_SECRET ?? fileValues.GRH_TEST_AUTH_SECRET
  const imageOrigin = localImageOrigin(
    inherited.GRH_TEST_IMAGE_ORIGIN ?? fileValues.GRH_TEST_IMAGE_ORIGIN,
  )
  if (!secret || secret.length < 32) {
    throw new Error("Set a stable, test-only GRH_TEST_AUTH_SECRET of at least 32 characters.")
  }
  // Preserve only operating-system/tool essentials; do not inherit live credentials,
  // proxy settings, NODE_OPTIONS, or Vercel environment metadata.
  const env = Object.fromEntries(
    Object.entries(inherited).filter(
      ([name, value]) =>
        value !== undefined &&
        /^(PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|TEMP|TMP|TMPDIR|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|LANG|LC_ALL|TZ|CI|TERM|FORCE_COLOR|NO_COLOR|DISPLAY|WAYLAND_DISPLAY|XDG_RUNTIME_DIR)$/i.test(
          name,
        ),
    ),
  )
  return {
    ...env,
    NODE_ENV: mode === "dev" ? "development" : mode === "test" ? "test" : "production",
    // The runner has already prepared the environment. Keep Next's ordinary
    // dotenv merge from importing the project's live environment into local mode.
    __NEXT_PROCESSED_ENV: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    DOTENV_CONFIG_PATH: path.join(root, ".env.test.local"),
    DATABASE_URL: databaseUrl,
    GRH_TEST_DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    GRH_TEST_AUTH_SECRET: secret,
    AUTH_SECRET: secret,
    NEXTAUTH_SECRET: secret,
    AUTH_URL: origin,
    NEXTAUTH_URL: origin,
    AUTH_TRUST_HOST: "true",
    RP_ID: "localhost",
    RP_NAME: "GRH Local Test",
    ORIGIN: origin,
    PORT: "3100",
    DISABLE_OUTBOUND: "true",
    GRH_LOCAL_TEST: "true",
    VERCEL: "",
    VERCEL_ENV: "",
    VERCEL_URL: "",
    VERCEL_PROJECT_PRODUCTION_URL: "",
    SMTP_HOST: "",
    SMTP_PORT: "",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    EMAIL_PASSWORD: "",
    CONTACT_EMAIL: "local@example.test",
    BLOB_URL_BASE: imageOrigin,
    BLOB_READ_WRITE_TOKEN: "",
    IMAGE_DOMAIN: "",
    VAPID_PRIVATE_KEY: "",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    TURNSTILE_SECRET_KEY: "",
    CRON_SECRET: "",
    CACHE_WARM_TOKEN: "",
    GITHUB_REPORTS_ENABLED: "false",
    GITHUB_ISSUES_TOKEN: "",
  }
}

async function main() {
  const [mode, ...extra] = process.argv.slice(2)
  if (!modes.includes(mode) || extra.length) {
    throw new Error(`Usage: node scripts/local-site.mjs ${modes.join("|")}`)
  }
  let fileValues = {}
  try {
    fileValues = parseEnv(await readFile(path.join(root, ".env.test.local"), "utf8"))
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error("Cannot read the local .env.test.local configuration.")
  }
  const env = localEnvironment(fileValues, process.env, mode)
  console.log(`[local-site] ${mode}: loopback database; ${origin}; outbound integrations disabled.`)
  if (mode === "check") return

  const commands = {
    build: [require.resolve("next/dist/bin/next"), "build"],
    start: [
      require.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3100",
    ],
    dev: [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3100",
    ],
    test: [path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs"), "run"],
    e2e: [require.resolve("@playwright/test/cli"), "test"],
  }
  if (mode === "e2e")
    console.log("[local-site] Uses the local website already running on port 3100.")
  const child = spawn(process.execPath, commands[mode], {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  })
  child.once("error", () => {
    console.error("[local-site] Could not launch the selected local command.")
    process.exitCode = 1
  })
  child.once("exit", (code) => {
    process.exitCode = code ?? 1
  })
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`[local-site] ${error.message}`)
    process.exitCode = 1
  })
}
