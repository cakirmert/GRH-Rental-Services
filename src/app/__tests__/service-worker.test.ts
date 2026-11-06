// @vitest-environment node
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"

const origin = "https://app.example.test"
const source = readFileSync(resolve("public/sw.js"), "utf8")

function windowClient(url: string) {
  return { url, focus: vi.fn().mockResolvedValue(undefined), navigate: vi.fn() }
}

function worker(windows: ReturnType<typeof windowClient>[] = []) {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {}
  const openWindow = vi.fn().mockResolvedValue(undefined)
  const showNotification = vi.fn().mockResolvedValue(undefined)
  const matchAll = vi.fn().mockResolvedValue(windows)
  runInNewContext(source, {
    URL,
    self: {
      location: { origin },
      registration: { showNotification },
      addEventListener: (name: string, callback: (event: Record<string, unknown>) => void) => {
        listeners[name] = callback
      },
    },
    clients: { matchAll, openWindow },
  })
  return {
    openWindow,
    showNotification,
    matchAll,
    async click(data?: unknown) {
      const close = vi.fn()
      const waitUntil = vi.fn()
      listeners.notificationclick({ notification: { data, close }, waitUntil })
      expect(close).toHaveBeenCalledOnce()
      expect(waitUntil).toHaveBeenCalledOnce()
      await waitUntil.mock.calls[0][0]
    },
    async push(data: unknown) {
      const waitUntil = vi.fn()
      listeners.push({ data: { json: () => data }, waitUntil })
      await waitUntil.mock.calls[0][0]
    },
  }
}

describe("native notification navigation", () => {
  it.each(["/messages/id%2Fwith%3Fquery", "/bookings/booking-1", "/staff"])(
    "opens the requested native path %s when no window exists",
    async (path) => {
      const app = worker()
      await app.click({ url: path })
      expect(app.openWindow).toHaveBeenCalledWith(`${origin}${path}`)
    },
  )

  it("keeps the push destination intact in the displayed notification", async () => {
    const app = worker()
    const payload = {
      title: "New request",
      body: "Test room",
      url: "/staff",
      data: { type: "booking-request" },
    }
    await app.push(payload)
    expect(app.showNotification).toHaveBeenCalledWith(
      "New request",
      expect.objectContaining({ data: payload }),
    )
  })

  it("navigates and then focuses an exact same-origin window", async () => {
    const foreign = windowClient(`https://other.example/?next=${origin}`)
    const appWindow = windowClient(`${origin}/items/item-1`)
    const destination = windowClient(`${origin}/messages/booking-1`)
    appWindow.navigate.mockResolvedValue(destination)
    const app = worker([foreign, appWindow])
    await app.click({ url: "/messages/booking-1" })
    expect(foreign.navigate).not.toHaveBeenCalled()
    expect(foreign.focus).not.toHaveBeenCalled()
    expect(appWindow.navigate).toHaveBeenCalledWith(`${origin}/messages/booking-1`)
    expect(destination.focus).toHaveBeenCalledOnce()
    expect(appWindow.navigate.mock.invocationCallOrder[0]).toBeLessThan(
      destination.focus.mock.invocationCallOrder[0],
    )
    expect(app.openWindow).not.toHaveBeenCalled()
  })

  it("focuses an already open destination without reloading it", async () => {
    const appWindow = windowClient(`${origin}/staff`)
    const app = worker([appWindow])
    await app.click({ url: "/staff" })
    expect(appWindow.navigate).not.toHaveBeenCalled()
    expect(appWindow.focus).toHaveBeenCalledOnce()
    expect(app.openWindow).not.toHaveBeenCalled()
  })

  it("opens the native path if an existing window disappears during navigation", async () => {
    const appWindow = windowClient(`${origin}/`)
    appWindow.navigate.mockRejectedValue(new Error("Window closed"))
    const app = worker([appWindow])
    await app.click({ url: "/bookings/booking-1" })
    expect(app.openWindow).toHaveBeenCalledWith(`${origin}/bookings/booking-1`)
  })

  it.each([
    "https://other.example/",
    "//other.example/",
    "https://app.example.test.other.example/",
    "https://other.example/?next=https://app.example.test",
    "https://user:secret@app.example.test/staff",
    "javascript:alert(1)",
    "blob:https://app.example.test/opaque",
    "http://[invalid",
    null,
    { url: "/staff" },
  ])("rejects an unsafe notification destination: %s", async (url) => {
    const app = worker()
    await app.click({ url })
    expect(app.openWindow).toHaveBeenCalledWith(`${origin}/`)
  })

  it("does not interpret legacy query links as navigation aliases", async () => {
    const app = worker()
    await app.click({ url: "/?chat=old&highlight=old#fragment" })
    expect(app.openWindow).toHaveBeenCalledWith(`${origin}/`)
  })
})
