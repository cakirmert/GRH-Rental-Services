import { describe, it, expect, vi } from "vitest"
import { uploadRouter } from "../adminRouter"
import type { Context } from "@/server/context"

// Mock @vercel/blob
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({ url: "https://example.com/image.jpg" }),
}))

// Mock env
process.env.BLOB_READ_WRITE_TOKEN = "dummy-token"

function createCaller() {
  const ctx: Context = {
    prisma: {} as unknown as Context["prisma"], // Not used in this router
    session: {
      user: { id: "admin1", role: "ADMIN", email: "admin@example.com" },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    req: new Request("http://localhost"),
  }
  return uploadRouter.createCaller(ctx)
}

describe("uploadRouter", () => {
  it("allows upload of small file", async () => {
    const caller = createCaller()
    const result = await caller.uploadItemImage({
      fileName: "test.png",
      fileContentBase64: "SGVsbG8gV29ybGQ=", // "Hello World"
    })
    expect(result).toEqual({ imageUrl: "https://example.com/image.jpg" })
  })

  it("rejects upload of large file", async () => {
    const caller = createCaller()
    const limit = 7 * 1024 * 1024
    const largeContent = "a".repeat(limit + 1) // > 7MB
    await expect(
      caller.uploadItemImage({
        fileName: "large.png",
        fileContentBase64: largeContent,
      }),
    ).rejects.toThrow()
  })
})
