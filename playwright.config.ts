import { defineConfig } from "@playwright/test"
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
  },
})
