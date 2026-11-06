import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

const calls = vi.hoisted(() => ({ run: vi.fn(async () => ({ ok: true, results: [] })) }))
vi.mock("./utils", () => ({ authorizeCronRequest: () => null, runCronTasks: calls.run }))
vi.mock("@/lib/prismadb", () => ({ default: {} }))

describe("scheduled retention safety", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each(["morning", "evening"])(
    "never assumes item returns and uses only guarded user cleanup in the %s schedule",
    async (period) => {
      const route =
        period === "morning" ? await import("./morning/route") : await import("./evening/route")
      await route.GET(new Request("http://localhost/api/cron/test") as NextRequest)
      const tasks = (calls.run.mock.calls[0] as unknown as [{ name: string }[]])[0].map(
        (task) => task.name,
      )
      if (period === "morning") expect(tasks).not.toContain("deleteInactiveUsers")
      if (period === "evening") expect(tasks).toContain("deleteInactiveUsers")
      expect(tasks).not.toContain("autoCompleteBorrowedBookings")
      if (period === "morning") expect(tasks).toContain("deleteOldBookings")
      if (period === "evening") expect(tasks).toContain("cleanExpiredAuthRecords")
    },
  )
})
