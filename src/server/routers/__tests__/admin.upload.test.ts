import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Context } from "@/server/context"
import { uploadRouter } from "@/server/routers/adminRouter"

// Mock put from @vercel/blob
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({ url: "https://example.com/image.jpg" }),
}))

// Mock env
process.env.BLOB_READ_WRITE_TOKEN = "mock-token"

describe("uploadItemImage validation", () => {
  const createCaller = () => {
    const ctx: Context = {
        prisma: {} as any, // We don't need prisma for this test
        session: {
            user: { id: "admin1", role: "ADMIN", email: "admin@example.com" },
            expires: new Date().toISOString(),
        },
        req: new Request("http://localhost"),
    }
    return uploadRouter.createCaller(ctx)
  }

  it("allows uploading small images", async () => {
    const caller = createCaller()
    const input = {
      fileName: "test.jpg",
      fileContentBase64: Buffer.from("small content").toString("base64"),
    }
    await expect(caller.uploadItemImage(input)).resolves.toEqual({
      imageUrl: "https://example.com/image.jpg",
    })
  })

  it("rejects uploading overly large images", async () => {
    const caller = createCaller()
    // Create a large base64 string ~6MB (decoded)
    // 6MB * 1024 * 1024 bytes
    const largeContent = "a".repeat(6 * 1024 * 1024)
    const input = {
      fileName: "large.jpg",
      fileContentBase64: Buffer.from(largeContent).toString("base64"),
    }

    // This test is expected to fail currently as there is no limit.
    // Once fixed, it should throw an error.
    // So for now, we just assert that it DOES NOT throw, to confirm reproduction.
    // Or we can expect it to fail and see the test fail, confirming reproduction.
    // I'll expect it to succeed now (which is bad), and later change to expect failure.
    // Wait, the goal is to reproduce the issue. The issue is LACK of validation.
    // So if I expect it to throw, the test will fail, proving the vulnerability.

    // However, vitest might timeout or run out of memory if I push it too hard.
    // 6MB is small enough to not crash the test runner but large enough to trigger the limit we will set (5MB).

    // I will write the test as if the fix is already there, so it fails now.
    await expect(caller.uploadItemImage(input)).rejects.toThrow()
  })
})
