import { describe, it, expect, vi, beforeEach } from "vitest"

const BookingStatus = {
  ACCEPTED: "ACCEPTED",
  BORROWED: "BORROWED",
}

const prismaMock = {
  booking: {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}

vi.mock("@/lib/prismadb", () => ({
  __esModule: true,
  default: prismaMock,
}))

// Mock @prisma/client if it's not available in the environment
vi.mock("@prisma/client", () => ({
  BookingStatus,
}))

describe("markUpcomingBookingsBorrowed optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("performs a single updateMany call instead of multiple updates", async () => {
    const { markUpcomingBookingsBorrowed } = await import("../autoBorrowed")

    prismaMock.booking.updateMany.mockResolvedValue({ count: 3 })

    await markUpcomingBookingsBorrowed()

    expect(prismaMock.booking.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.booking.updateMany).toHaveBeenCalledWith({
      where: {
        status: BookingStatus.ACCEPTED,
        startDate: {
          lte: expect.any(Date),
        },
      },
      data: { status: BookingStatus.BORROWED },
    })
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled()
    expect(prismaMock.booking.update).not.toHaveBeenCalled()
  })
})
