import { describe, it, expect, vi, beforeEach } from "vitest"
import { uploadRouter } from "../adminRouter"
import { TRPCError } from "@trpc/server"
import type { Context } from "@/server/context"
import { put } from "@vercel/blob"

// Mock @vercel/blob
vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
}))

// Mock context helper
const createMockContext = (role: string = "USER") => ({
  prisma: {} as any,
  session: {
    user: {
      id: "test-user-id",
      role: role,
    },
  },
} as unknown as Context)

describe("uploadRouter.uploadItemImage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BLOB_READ_WRITE_TOKEN = "test-token"
  })

  it("should throw FORBIDDEN if user is not an admin", async () => {
    const ctx = createMockContext("USER")
    const caller = uploadRouter.createCaller(ctx)

    await expect(
      caller.uploadItemImage({
        fileName: "test.png",
        fileContentBase64: "base64content",
      })
    ).rejects.toThrow()
  })

  it("should throw BAD_REQUEST if file extension is not allowed", async () => {
    const ctx = createMockContext("ADMIN")
    const caller = uploadRouter.createCaller(ctx)

    try {
      await caller.uploadItemImage({
        fileName: "test.html",
        fileContentBase64: "base64content",
      })
      expect.fail("Should have thrown")
    } catch (error: any) {
      expect(error.code).toBe("BAD_REQUEST")
      expect(error.message).toContain("Only JPG, PNG, WEBP, and GIF are allowed")
    }
  })

  it("should throw validation error if fileContentBase64 is too large", async () => {
    const ctx = createMockContext("ADMIN")
    const caller = uploadRouter.createCaller(ctx)

    const largeContent = "a".repeat(11 * 1024 * 1024) // 11MB

    await expect(
      caller.uploadItemImage({
        fileName: "test.png",
        fileContentBase64: largeContent,
      })
    ).rejects.toThrow()
  })

  it("should upload successfully if user is admin and file is valid", async () => {
    const ctx = createMockContext("ADMIN")
    const caller = uploadRouter.createCaller(ctx)

    vi.mocked(put).mockResolvedValue({ url: "https://blob.example.com/items/uuid.png", downloadUrl: "", pathname: "", size: 0, uploadedAt: new Date() })

    const result = await caller.uploadItemImage({
      fileName: "test.png",
      fileContentBase64: Buffer.from("fake image content").toString("base64"),
    })

    expect(result).toEqual({ imageUrl: "https://blob.example.com/items/uuid.png" })
    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^items\/.*\.png$/),
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "image/png",
        access: "public",
        token: "test-token",
      })
    )
  })

  it("should handle .jpg extension and use image/jpeg content type", async () => {
    const ctx = createMockContext("ADMIN")
    const caller = uploadRouter.createCaller(ctx)

    vi.mocked(put).mockResolvedValue({ url: "https://blob.example.com/items/uuid.jpg", downloadUrl: "", pathname: "", size: 0, uploadedAt: new Date() })

    await caller.uploadItemImage({
      fileName: "test.jpg",
      fileContentBase64: Buffer.from("fake image content").toString("base64"),
    })

    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^items\/.*\.jpg$/),
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "image/jpeg",
      })
    )
  })
})
