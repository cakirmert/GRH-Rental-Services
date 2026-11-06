import { act, cleanup, render } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import PushNotificationManager from "../PushNotificationManager"

const mocks = vi.hoisted(() => ({
  id: "account-a",
  status: "authenticated",
  subscribeUser: vi.fn(),
  unsubscribeUser: vi.fn(),
  isCurrentUserPushSubscription: vi.fn(),
  toast: vi.fn(),
  translate: (key: string) => key,
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: mocks.id } }, status: mocks.status }),
}))
vi.mock("@/app/actions", () => ({
  subscribeUser: mocks.subscribeUser,
  unsubscribeUser: mocks.unsubscribeUser,
  isCurrentUserPushSubscription: mocks.isCurrentUserPushSubscription,
}))
vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ t: mocks.translate }) }))
vi.mock("@/components/ui/use-toast", () => ({ toast: mocks.toast }))

type Controls = {
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
  isSubscribed: boolean
  isSupported: boolean
}
const controls = () =>
  (window as Window & { pushNotificationControls?: Controls }).pushNotificationControls!
const originalWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker")
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function browser(permission: NotificationPermission = "granted") {
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/synthetic",
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  }
  const registration = { pushManager }
  const register = vi.fn().mockResolvedValue(registration)
  const requestPermission = vi.fn().mockResolvedValue("granted")
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve(registration), register },
  })
  vi.stubGlobal("PushManager", class {})
  vi.stubGlobal("Notification", { permission, requestPermission })
  return { subscription, pushManager, registration, register, requestPermission }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.id = "account-a"
  mocks.status = "authenticated"
  mocks.subscribeUser.mockResolvedValue({ success: true })
  mocks.unsubscribeUser.mockResolvedValue({ success: true })
  mocks.isCurrentUserPushSubscription.mockResolvedValue(true)
  localStorage.clear()
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AQID")
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  if (originalWorker) Object.defineProperty(navigator, "serviceWorker", originalWorker)
  else Reflect.deleteProperty(navigator, "serviceWorker")
})

describe("push manager browser and account lifecycle", () => {
  it("has an inert server rendering and does not register a worker during SSR", () => {
    const { register } = browser()
    expect(renderToString(<PushNotificationManager />)).toBe("")
    expect(register).not.toHaveBeenCalled()
  })

  it("exposes unsupported capabilities without attempting registration", () => {
    render(<PushNotificationManager />)
    expect(controls().isSupported).toBe(false)
    expect(mocks.subscribeUser).not.toHaveBeenCalled()
  })

  it("subscribes and unsubscribes through the existing browser and server APIs", async () => {
    const { subscription, pushManager } = browser()
    render(<PushNotificationManager />)
    await act(async () => {})
    await act(async () => {
      await controls().subscribe()
    })
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    })
    expect(mocks.subscribeUser).toHaveBeenCalledWith({ endpoint: subscription.endpoint })
    expect(controls().isSubscribed).toBe(true)
    await act(async () => {
      await controls().unsubscribe()
    })
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.unsubscribeUser).toHaveBeenCalledWith(subscription.endpoint)
    expect(controls().isSubscribed).toBe(false)
  })

  it("removes a browser subscription linked to a different account", async () => {
    const { subscription, pushManager } = browser()
    pushManager.getSubscription.mockResolvedValue(subscription)
    mocks.isCurrentUserPushSubscription.mockResolvedValue(false)
    render(<PushNotificationManager />)
    await act(async () => {})
    expect(mocks.isCurrentUserPushSubscription).toHaveBeenCalledWith(subscription.endpoint)
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(controls().isSubscribed).toBe(false)
  })

  it("cancels the scheduled permission prompt and removes controls on unmount", async () => {
    vi.useFakeTimers()
    const { requestPermission } = browser("default")
    const { unmount } = render(<PushNotificationManager />)
    await act(async () => {})
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(requestPermission).not.toHaveBeenCalled()
    expect(controls()).toBeUndefined()
  })

  it("prompts at most once and does not claim success when server subscription fails", async () => {
    vi.useFakeTimers()
    const { requestPermission } = browser("default")
    mocks.subscribeUser.mockRejectedValue(new Error("Account mismatch"))
    render(<PushNotificationManager />)
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(localStorage.getItem("grh-notification-prompted")).toBe("true")
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "notifications.subscriptionFailed" }),
    )
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "notifications.enabled" }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(requestPermission).toHaveBeenCalledOnce()
  })

  it("does not prompt again when the browser has already recorded the prompt", async () => {
    vi.useFakeTimers()
    const { requestPermission } = browser("default")
    localStorage.setItem("grh-notification-prompted", "true")
    render(<PushNotificationManager />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it("ignores the previous account's late registration result", async () => {
    const { register, registration } = browser()
    const old = deferred<typeof registration>()
    register.mockReturnValueOnce(old.promise)
    const { rerender } = render(<PushNotificationManager />)
    mocks.id = "account-b"
    rerender(<PushNotificationManager />)
    await act(async () => {})
    await act(async () => {
      old.resolve({
        pushManager: {
          ...registration.pushManager,
          getSubscription: vi.fn().mockResolvedValue({ endpoint: "old-account" }),
        },
      })
    })
    expect(controls().isSubscribed).toBe(false)
    expect(mocks.subscribeUser).not.toHaveBeenCalled()
  })

  it("does not persist a pending browser subscription under the next account", async () => {
    const { pushManager, subscription } = browser()
    const pending = deferred<typeof subscription>()
    pushManager.subscribe.mockReturnValue(pending.promise)
    const { rerender } = render(<PushNotificationManager />)
    await act(async () => {})
    let operation!: Promise<void>
    await act(async () => {
      operation = controls().subscribe()
    })
    mocks.id = "account-b"
    rerender(<PushNotificationManager />)
    await act(async () => {
      pending.resolve(subscription)
      await operation
    })
    expect(mocks.subscribeUser).not.toHaveBeenCalled()
    expect(controls().isSubscribed).toBe(false)
  })

  it.each(["loading", "unauthenticated"])(
    "never subscribes for a retained session while %s",
    async (status) => {
      const { pushManager } = browser()
      mocks.status = status
      render(<PushNotificationManager />)
      await act(async () => {
        await controls().subscribe()
      })
      expect(pushManager.subscribe).not.toHaveBeenCalled()
      expect(mocks.subscribeUser).not.toHaveBeenCalled()
    },
  )
})
