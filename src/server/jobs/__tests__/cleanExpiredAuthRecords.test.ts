import { describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { cleanExpiredAuthRecords } from "../cleanExpiredAuthRecords"
vi.mock("@/lib/prismadb", () => ({ default: {} }))

describe("bounded expired authentication record cleanup", () => {
  it("bounds candidate reads and rechecks expiry before deleting potentially renewed records", async () => {
    const db = {
      session: {
        findMany: vi.fn().mockResolvedValue([{ id: "expired" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      verificationToken: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ identifier: "fixture@example.test", token: "expired" }]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    expect(await cleanExpiredAuthRecords(db as unknown as PrismaClient)).toEqual({
      sessionsDeleted: 0,
      verificationTokensDeleted: 1,
    })
    expect(db.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000, where: { expires: { lte: expect.any(Date) } } }),
    )
    expect(db.verificationToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1000 }),
    )
    expect(db.session.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["expired"] }, expires: { lte: expect.any(Date) } },
    })
    expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ identifier: "fixture@example.test", token: "expired" }],
        expires: { lte: expect.any(Date) },
      },
    })
  })
})
