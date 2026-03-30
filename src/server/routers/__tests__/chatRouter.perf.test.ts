import { describe, it, expect, vi, beforeEach } from "vitest"
import { chatRouter } from "../chatRouter"
import type { Context } from "@/server/context"
import { notificationEmitter } from "@/lib/notifications"

// Mock Prisma
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
  notification: {
    create: vi.fn(),
    createManyAndReturn: vi.fn(),
  },
}

// Mock emitter
vi.mock("@/lib/notifications", () => ({
  notificationEmitter: {
    emit: vi.fn(),
  },
}))

const ctx = {
  prisma: prisma as unknown as Context["prisma"],
  session: {
    user: {
      id: "user-1",
      role: "USER",
    },
  },
} as unknown as Context

describe("chatRouter.send optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses createManyAndReturn for batch notification creation", async () => {
    const bookingId = "booking-1"
    const threadId = "thread-1"

    prisma.booking.findUnique.mockResolvedValue({
      id: bookingId,
      userId: "owner-1",
      assignedToId: "staff-1",
      endDate: new Date(Date.now() + 100000),
      chatThread: { id: threadId, closedAt: null },
      item: { titleEn: "Test Item" },
    })

    prisma.bookingChatThread.findUnique.mockResolvedValue({
      booking: {
        id: bookingId,
        userId: "owner-1",
        assignedToId: "staff-1",
        item: { titleEn: "Test Item" },
      },
    })

    prisma.bookingChatMessage.findFirst.mockResolvedValue(null)
    prisma.bookingChatMessage.findMany.mockResolvedValue([])
    prisma.bookingChatMessage.create.mockResolvedValue({
      id: "msg-1",
      threadId: threadId,
      senderId: "user-1",
      body: "Hello",
      sender: { name: "User 1", role: "USER" },
    })

    // Mock createManyAndReturn to return the created notifications
    prisma.notification.createManyAndReturn.mockResolvedValue([
      { id: "notif-1", userId: "owner-1" },
      { id: "notif-2", userId: "staff-1" },
    ])

    const caller = chatRouter.createCaller(ctx)
    await caller.send({ bookingId, body: "Hello" })

    // Should NOT call create sequentially anymore
    expect(prisma.notification.create).not.toHaveBeenCalled()

    // Should call createManyAndReturn once with both recipients
    expect(prisma.notification.createManyAndReturn).toHaveBeenCalledTimes(1)
    const callArgs = (prisma.notification.createManyAndReturn as any).mock.calls[0][0]
    expect(callArgs.data).toHaveLength(2)
    expect(callArgs.data.map((d: any) => d.userId)).toContain("owner-1")
    expect(callArgs.data.map((d: any) => d.userId)).toContain("staff-1")

    // Should still emit events for each notification
    expect(notificationEmitter.emit).toHaveBeenCalledTimes(2)
    expect(notificationEmitter.emit).toHaveBeenCalledWith(
      "new",
      expect.objectContaining({ id: "notif-1" }),
    )
    expect(notificationEmitter.emit).toHaveBeenCalledWith(
      "new",
      expect.objectContaining({ id: "notif-2" }),
    )
  })
})
