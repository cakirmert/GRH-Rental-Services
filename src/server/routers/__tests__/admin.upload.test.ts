
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadRouter } from "../adminRouter";
import type { Context } from "@/server/context";

// Mock @vercel/blob
vi.mock("@vercel/blob", () => ({
  put: vi.fn().mockResolvedValue({ url: "https://example.com/image.jpg" }),
}));

function createCaller(role: "ADMIN" | "USER" = "USER") {
  const prisma = {};
  const ctx: Context = {
    prisma: prisma as any,
    session: {
      user: { id: "user1", role: role, email: "user@example.com", name: "User" },
      expires: "2024-12-31T23:59:59.000Z",
    },
  } as any;

  const caller = uploadRouter.createCaller(ctx);
  return { caller };
}

describe("uploadItemImage security check", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, BLOB_READ_WRITE_TOKEN: "mock-token" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("denies non-admin access to upload image", async () => {
    const { caller } = createCaller("USER");

    await expect(
      caller.uploadItemImage({
        fileName: "test.jpg",
        fileContentBase64: "base64content",
      })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("allows admin to upload image", async () => {
    const { caller } = createCaller("ADMIN");

    const result = await caller.uploadItemImage({
      fileName: "test.jpg",
      fileContentBase64: "base64content",
    });

    expect(result).toEqual({ imageUrl: "https://example.com/image.jpg" });
  });
});
