import { beforeEach, describe, expect, it, vi } from "vitest"
import { chatRouter } from "../chatRouter"
import type { Context } from "@/server/context"

vi.mock("@/lib/notifications", () => ({
  notificationEmitter: {
    emit: vi.fn(),
  },
}))

const prisma = {
  booking: {
    findUnique: vi.fn(),
  },
  bookingChatThread: {
    upsert: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  bookingChatMessage: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  bookingChatRead: {
    upsert: vi.fn(),
  },
  notification: {
    create: vi.fn(),
    createManyAndReturn: vi.fn(),
  },
}

function context(role: "ADMIN" | "RENTAL" | "USER", id: string): Context {
  return {
    prisma: prisma as unknown as Context["prisma"],
    session: {
      user: { id, role, email: `${id}@example.com` },
      expires: "2026-12-31T23:59:59.000Z",
    },
    req: new Request("http://localhost"),
  }
}

function inaccessibleBooking() {
  return {
    userId: "resident-1",
    assignedToId: null,
    item: { responsibleMembers: [{ id: "other-rental" }] },
  }
}

describe("chat router security boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("does not let rental users list chat messages for unrelated bookings", async () => {
    prisma.booking.findUnique.mockResolvedValue(inaccessibleBooking())

    await expect(
      chatRouter.createCaller(context("RENTAL", "rental-1")).list({ bookingId: "booking-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(prisma.bookingChatThread.upsert).not.toHaveBeenCalled()
  })

  it("lets responsible rental users list chat messages for scoped bookings", async () => {
    prisma.booking.findUnique.mockResolvedValue({
      userId: "resident-1",
      assignedToId: null,
      item: { responsibleMembers: [{ id: "rental-1" }] },
    })
    prisma.bookingChatThread.upsert.mockResolvedValue({ id: "thread-1" })
    prisma.bookingChatMessage.findMany.mockResolvedValue([])

    await expect(
      chatRouter.createCaller(context("RENTAL", "rental-1")).list({ bookingId: "booking-1" }),
    ).resolves.toEqual({ messages: [], nextCursor: undefined })
  })

  it("does not mark messages read unless the user can access their booking", async () => {
    prisma.bookingChatMessage.findMany.mockResolvedValue([
      { id: "message-1", thread: { bookingId: "booking-1" } },
    ])
    prisma.booking.findUnique.mockResolvedValue(inaccessibleBooking())

    await expect(
      chatRouter
        .createCaller(context("RENTAL", "rental-1"))
        .markRead({ messageIds: ["message-1"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(prisma.bookingChatRead.upsert).not.toHaveBeenCalled()
  })

  it("deduplicates message ids after proving booking access", async () => {
    prisma.bookingChatMessage.findMany.mockResolvedValue([
      { id: "message-1", thread: { bookingId: "booking-1" } },
    ])
    prisma.booking.findUnique.mockResolvedValue({
      userId: "resident-1",
      assignedToId: null,
      item: { responsibleMembers: [] },
    })
    prisma.bookingChatRead.upsert.mockResolvedValue({})

    await expect(
      chatRouter
        .createCaller(context("USER", "resident-1"))
        .markRead({ messageIds: ["message-1", "message-1"] }),
    ).resolves.toEqual({ ok: true })
    expect(prisma.bookingChatRead.upsert).toHaveBeenCalledTimes(1)
  })
})
