import { describe, it, expect } from "vitest"
import { vi } from "vitest"
import { bookingsRouter } from "../bookingRouter"
import type { Context } from "@/server/context"
import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"

vi.mock("@/lib/prismadb", () => ({ default: { log: { create: vi.fn() } } }))

vi.mock("@/server/jobs/autoBorrowed", () => ({
  markUpcomingBookingsBorrowed: vi.fn(),
}))

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

  it.each([undefined, "ACCEPTED"] as const)(
    "includes null notes without broadening staff or search scope for %s",
    async (status) => {
      const { caller, prisma } = createCaller()
      await caller.listForRentalTeam({ status, searchTerm: "Synthetic item" })
      const { where } = prisma.booking.findMany.mock.calls[0][0]
      expect(where.item.responsibleMembers.some).toEqual({ id: "rental1" })
      expect(where.status).toEqual(status ?? { in: ["REQUESTED", "ACCEPTED", "BORROWED"] })
      expect(where.OR).toEqual([
        { notes: null },
        { NOT: { notes: { startsWith: ADMIN_BLOCK_PREFIX } } },
      ])
      expect(where.AND).toContainEqual({
        OR: expect.arrayContaining([{ item: { titleEn: { contains: "Synthetic item" } } }]),
      })
    },
  )

  it("retains explicit non-accepted status filtering", async () => {
    const { caller, prisma } = createCaller()
    await caller.listForRentalTeam({ status: "COMPLETED" })
    expect(prisma.booking.findMany.mock.calls[0][0].where).toEqual({
      item: { responsibleMembers: { some: { id: "rental1" } } },
      status: "COMPLETED",
    })
  })
})
