// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn(),
}))
vi.mock("../../../auth", () => ({ auth: vi.fn(async () => ({ user: { id: "owner" } })) }))
vi.mock("@/lib/prismadb", () => ({
  default: {
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ pushSubscription: mocks }),
    pushSubscription: mocks,
  },
}))
vi.mock("@/lib/pushSubscription", () => ({ assertValidPushSubscription: vi.fn() }))
import { subscribeUser } from "../actions"
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/opaque", keys: { p256dh: "key", auth: "auth" }, expirationTime: null } as unknown as PushSubscription & { keys: { p256dh: string; auth: string } }
beforeEach(() => vi.resetAllMocks())
describe("push endpoint ownership", () => {
  it("rejects reassignment without changing the stored owner or keys", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "victim" })
    await expect(subscribeUser(sub)).rejects.toThrow("another account")
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it("allows the owner to refresh keys", async () => {
    mocks.findUnique.mockResolvedValue({ userId: "owner" })
    await expect(subscribeUser(sub)).resolves.toEqual({ success: true })
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { endpoint: sub.endpoint, userId: "owner" },
    }))
  })
})
