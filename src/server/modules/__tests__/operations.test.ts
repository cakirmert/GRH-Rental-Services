// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BookingStatus, Prisma } from "@prisma/client"
import type { OperationContext } from "../shared/operation"
import { OperationError } from "../shared/operation"
import type { BookingEffects } from "../bookings/effects"
import type { AdministrationEffects } from "../administration/effects"

vi.mock("../bookings/effects", () => ({ bookingEffects: {} }))
vi.mock("../administration/effects", () => ({ administrationEffects: {} }))
vi.mock("@/lib/auth/state", () => ({ consumeBudget: vi.fn(async () => true) }))

import { cancelBooking, createBooking } from "../bookings/commands"
import { createItem, updateItem } from "../administration/inventory"
import { promoteAdministrator } from "../administration/members"
import { uploadItemImage } from "../administration/uploads"
import { invoke } from "../shared/trpcAdapter"
import type { Context } from "@/server/context"

const events: string[] = []
const db = {
  $transaction: vi.fn(),
  item: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  booking: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  recurringBlock: { findMany: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
}
const context: OperationContext = {
  db: db as unknown as OperationContext["db"],
  actor: { id: "resident", role: "USER" },
}
const bookingEffects: BookingEffects = {
  recordAudit: vi.fn(async () => {
    events.push("audit")
  }),
  statusChanged: vi.fn(async () => {
    events.push("status-notification")
  }),
  refreshUpcoming: vi.fn(),
  bookingRequested: vi.fn(async () => {
    events.push("request-notification")
  }),
}
const adminEffects: AdministrationEffects = {
  recordAudit: vi.fn(async () => {
    events.push("audit")
  }),
  inventoryChanged: vi.fn(async () => {
    events.push("invalidate-inventory")
  }),
  assertUploadsEnabled: vi.fn(),
  storeImage: vi.fn(),
}
const bookingInput = () => ({
  itemId: "item",
  quantity: 1,
  start: new Date(Date.now() + 3600000).toISOString(),
  end: new Date(Date.now() + 7200000).toISOString(),
  notes: "For our event",
})
const inventoryInput = {
  titleEn: "Projector",
  type: "OTHER" as const,
  totalQuantity: 1,
  active: true,
}
const asAdmin = { ...context, actor: { id: "admin", role: "ADMIN" } }

describe("backend operations without tRPC or NextAuth sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    events.length = 0
    db.$transaction.mockImplementation(async (operation) => {
      events.push("begin")
      try {
        const result = await operation(db)
        events.push("commit")
        return result
      } catch (error) {
        events.push("rollback")
        throw error
      }
    })
    db.item.findUnique.mockResolvedValue({
      id: "item",
      type: "OTHER",
      active: true,
      totalQuantity: 1,
      titleEn: "Projector",
      titleDe: null,
      responsibleMembers: [],
    })
    db.booking.count.mockResolvedValue(0)
    db.booking.findFirst.mockResolvedValue(null)
    db.booking.findMany.mockResolvedValue([])
    db.recurringBlock.findMany.mockResolvedValue([])
    db.booking.create.mockImplementation(async ({ data }) => {
      events.push("insert-booking")
      return { id: "booking", ...data }
    })
    db.item.create.mockImplementation(async ({ data }) => {
      events.push("insert-item")
      return { id: "item", ...data }
    })
  })

  it("commits capacity-checked creation before invoking notification delivery", async () => {
    const result = await createBooking(context, bookingInput(), bookingEffects)
    expect(result).toMatchObject({ id: "booking", userId: "resident", status: "REQUESTED" })
    expect(events).toEqual(["begin", "insert-booking", "commit", "request-notification"])
    expect(db.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    )
    expect(bookingEffects.bookingRequested).toHaveBeenCalledWith(
      expect.objectContaining({ actor: context.actor, booking: result }),
    )
  })

  it("rolls back capacity conflicts without creating a row or delivering a notification", async () => {
    const input = bookingInput()
    db.booking.findMany.mockResolvedValue([
      { startDate: new Date(input.start), endDate: new Date(input.end), quantity: 1 },
    ])
    await expect(createBooking(context, input, bookingEffects)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    expect(events).toEqual(["begin", "rollback"])
    expect(db.booking.create).not.toHaveBeenCalled()
    expect(bookingEffects.bookingRequested).not.toHaveBeenCalled()
  })

  it("does not retry or notify after a PostgreSQL serializable conflict", async () => {
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2034",
        clientVersion: "test",
      }),
    )
    await expect(createBooking(context, bookingInput(), bookingEffects)).rejects.toMatchObject({
      code: "CONFLICT",
    })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(bookingEffects.bookingRequested).not.toHaveBeenCalled()
  })

  it("rejects unrelated cancellation and never calls effects", async () => {
    db.booking.findUnique.mockResolvedValue({
      id: "booking",
      userId: "another",
      status: BookingStatus.REQUESTED,
      notes: null,
      item: { responsibleMembers: [] },
      assignedToId: null,
    })
    await expect(cancelBooking(context, { id: "booking" }, bookingEffects)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(events).toEqual(["begin", "rollback"])
    expect(db.booking.update).not.toHaveBeenCalled()
    expect(bookingEffects.statusChanged).not.toHaveBeenCalled()
    expect(bookingEffects.recordAudit).not.toHaveBeenCalled()
  })

  it("requires administration authority before database or external work", async () => {
    await expect(createItem(context, inventoryInput, adminEffects)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(
      uploadItemImage(
        context,
        { fileName: "image.png", fileContentBase64: "invalid" },
        adminEffects,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.item.create).not.toHaveBeenCalled()
    expect(adminEffects.assertUploadsEnabled).not.toHaveBeenCalled()
    expect(adminEffects.storeImage).not.toHaveBeenCalled()
  })

  it("invalidates inventory and records audit only after the item write", async () => {
    expect(await createItem(asAdmin, inventoryInput, adminEffects)).toMatchObject({ id: "item" })
    expect(events).toEqual(["insert-item", "invalidate-inventory", "audit"])
    events.length = 0
    db.item.update.mockRejectedValue(new Error("storage unavailable"))
    await expect(
      updateItem(asAdmin, { ...inventoryInput, id: "item" }, adminEffects),
    ).rejects.toThrow("storage unavailable")
    expect(events).toEqual([])
  })

  it("does not permit a normal administrator to grant administrator roles", async () => {
    await expect(
      promoteAdministrator(asAdmin, { userId: "target" }, adminEffects),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.user.findUnique).not.toHaveBeenCalled()
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it("maps application errors only at the transport boundary", async () => {
    const transport = {
      prisma: context.db,
      session: {
        user: { ...context.actor, email: "synthetic@example.test" },
        expires: "2099-01-01",
      },
    } as Context
    const failure = new OperationError({ code: "CONFLICT", message: "Changed by another member" })
    await expect(
      invoke(transport, async (operation) => {
        expect(operation).toEqual({
          db: context.db,
          actor: {
            ...context.actor,
            email: "synthetic@example.test",
            isSuperAdmin: undefined,
            name: undefined,
          },
        })
        throw failure
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: failure.message, cause: failure })
  })
})
