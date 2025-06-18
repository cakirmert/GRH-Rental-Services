import { describe, it, expect } from "vitest"
import { vi } from "vitest"
import { bookingsRouter } from "../bookings"
import type { Context } from "@/server/context"

function createCaller() {
  const prisma = {
    booking: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  }
  const ctx: Context = {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id: "rental1", role: "RENTAL", email: "rental@example.com" },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    req: new Request("http://localhost"),
  }
  return { caller: bookingsRouter.createCaller(ctx), prisma }
}

describe("listForRentalTeam filtering", () => {
  it("filters bookings by assigned items", async () => {
    const { caller, prisma } = createCaller()
    await caller.listForRentalTeam({})
    expect(prisma.booking.findMany).toHaveBeenCalled()
    const args = prisma.booking.findMany.mock.calls[0][0]
    expect(args.where.item.responsibleMembers.some).toEqual({ id: "rental1" })
  })
})
