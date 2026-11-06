import { configDefaults, defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: [...configDefaults.exclude, "tests/e2e/**", "**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "database",
          include: ["src/**/*.integration.test.ts"],
          // The suites share one restored database. Files run serially so
          // unrelated fixtures cannot cause PostgreSQL predicate conflicts.
          // Deliberate concurrent-operation tests still run within each file.
          fileParallelism: false,
        },
      },
    ],
  },
})
