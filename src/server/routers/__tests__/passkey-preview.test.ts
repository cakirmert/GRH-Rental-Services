// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { webauthnRouter } from "../webauthnRouter"
import { userRouter } from "../user"
import { registerPasskey, revokePasskey } from "@/lib/auth/passkey-store"
import type { Context } from "@/server/context"
import type { UserPasskey } from "@/types/auth"

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock("@/lib/prismadb", () => ({ default: db }))
vi.mock("@/lib/auth/state", async (original) => ({
  ...(await original<typeof import("@/lib/auth/state")>()),
  consumeBudget: vi.fn().mockResolvedValue(true),
  maintainAuthState: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/auth/ceremony", async (original) => ({
  ...(await original<typeof import("@/lib/auth/ceremony")>()),
  saveCeremony: vi.fn().mockResolvedValue(undefined),
}))

const context = {
  prisma: db,
  session: {
    user: { id: "preview-user", email: "preview@example.test", role: "USER" },
    expires: "2099-01-01T00:00:00Z",
  },
  req: new Request("http://localhost:3100/api/trpc"),
} as unknown as Context

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("GRH_PASSKEY_SIGNIN_ONLY", "true")
  vi.stubEnv("RP_ID", "localhost")
  vi.stubEnv("ORIGIN", "http://localhost:3100")
  db.user.findUnique.mockResolvedValue(context.session!.user)
})
afterEach(() => vi.unstubAllEnvs())

describe("passkey preview isolation", () => {
  it("rejects enrollment options before starting a browser ceremony", async () => {
    await expect(
      webauthnRouter.createCaller(context).registerOptions({ userId: "preview-user" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })

  it("rejects direct enrollment submissions before they can change credentials", async () => {
    await expect(
      webauthnRouter.createCaller(context).register({
        credential: {
          id: "a".repeat(22),
          rawId: "a".repeat(22),
          type: "public-key",
          response: { clientDataJSON: "e30", attestationObject: "e30" },
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("rejects credential removal through the account API", async () => {
    await expect(
      userRouter.createCaller(context).deletePasskey({ credentialId: "existing-key" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("also protects direct credential-store writes", async () => {
    await expect(registerPasskey("preview-user", {} as UserPasskey)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(revokePasskey("preview-user", "existing-key")).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("keeps existing-passkey authentication options available", async () => {
    const options = await webauthnRouter.createCaller(context).loginOptions({})
    expect(options.rpId).toBe("localhost")
    expect(options.challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("keeps normal enrollment available when the preview restriction is off", async () => {
    vi.stubEnv("GRH_PASSKEY_SIGNIN_ONLY", "false")
    const options = await webauthnRouter
      .createCaller(context)
      .registerOptions({ userId: "preview-user" })
    expect(options.rp.id).toBe("localhost")
    expect(db.user.findUnique).toHaveBeenCalledOnce()
  })
})
