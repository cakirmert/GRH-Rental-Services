import { describe, it, expect, vi, beforeEach } from "vitest"
import { BookingStatus, NotificationType } from "@prisma/client"
import { notifyBookingStatusChange } from "../bookingStatusNotifier"
import { notificationEmitter } from "@/lib/notifications"
import { sendBookingStatusEmail } from "@/server/email/sendBookingStatusEmail"

vi.mock("@/lib/notifications", () => ({
  notificationEmitter: {
    emit: vi.fn(),
  },
}))

vi.mock("@/server/email/sendBookingStatusEmail", () => ({
  sendBookingStatusEmail: vi.fn(),
}))

describe("notifyBookingStatusChange", () => {
  const prismaMock = {
    notification: {
      createManyAndReturn: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should create notifications in batch and emit events", async () => {
    const recipients = [
      { id: "user-1", email: "user1@example.com", name: "User 1" },
      { id: "user-2", email: "user2@example.com", name: "User 2" },
    ]

    const mockNotifications = recipients.map((r, i) => ({
      id: `notif-${i}`,
      userId: r.id,
      bookingId: "booking-1",
      type: NotificationType.BOOKING_RESPONSE,
      message: JSON.stringify({
        key: "notifications.status.accepted",
        vars: { item: "Test Item", actor: "Admin" },
      }),
    }))

    prismaMock.notification.createManyAndReturn.mockResolvedValue(mockNotifications)

    await notifyBookingStatusChange({
      prisma: prismaMock as any,
      bookingId: "booking-1",
      status: BookingStatus.ACCEPTED,
      itemTitle: "Test Item",
      startDate: new Date(),
      endDate: new Date(),
      recipients,
      performedBy: { id: "admin-1", name: "Admin" },
    })

    expect(prismaMock.notification.createManyAndReturn).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: "user-1", actorId: "admin-1" }),
        expect.objectContaining({ userId: "user-2", actorId: "admin-1" }),
      ]),
    })

    expect(notificationEmitter.emit).toHaveBeenCalledTimes(2)
    expect(sendBookingStatusEmail).toHaveBeenCalledTimes(2)
    expect(sendBookingStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({ booking: expect.objectContaining({ id: "booking-1" }) }),
    )
  })

  it("should not send email if status is not ACCEPTED or CANCELLED", async () => {
    const recipients = [{ id: "user-1", email: "user1@example.com", name: "User 1" }]
    prismaMock.notification.createManyAndReturn.mockResolvedValue([
      { id: "notif-1", userId: "user-1", message: "{}" },
    ])

    await notifyBookingStatusChange({
      prisma: prismaMock as any,
      bookingId: "booking-1",
      status: BookingStatus.BORROWED,
      itemTitle: "Test Item",
      startDate: new Date(),
      endDate: new Date(),
      recipients,
      performedBy: { id: "admin-1", name: "Admin" },
    })

    expect(sendBookingStatusEmail).not.toHaveBeenCalled()
  })

  it("keeps system notifications unassociated with a person", async () => {
    prismaMock.notification.createManyAndReturn.mockResolvedValue([])
    await notifyBookingStatusChange({
      prisma: prismaMock as any,
      bookingId: "booking-1",
      status: BookingStatus.CANCELLED,
      itemTitle: "Test Item",
      startDate: new Date(),
      endDate: new Date(),
      recipients: [{ id: "user-1" }],
    })
    expect(prismaMock.notification.createManyAndReturn).toHaveBeenCalledWith({
      data: [expect.objectContaining({ actorId: null, userId: "user-1" })],
    })
  })
})
