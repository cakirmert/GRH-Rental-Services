import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import NotificationBell from "../NotificationBell"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  openChat: vi.fn(),
  markRead: vi.fn(),
  notifications: [] as {
    id: string
    bookingId: string
    message: string
    type: string
    read: boolean
  }[],
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/features/chat/ChatProvider", () => ({ useChat: () => ({ openChat: mocks.openChat }) }))
vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({ data: mocks.notifications, refetch: vi.fn() }),
}))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    useUtils: () => ({ notifications: { getAll: { setData: vi.fn() } } }),
    notifications: {
      markRead: { useMutation: () => ({ mutate: mocks.markRead }) },
      delete: { useMutation: () => ({ mutate: vi.fn() }) },
      clearAll: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}))
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(cleanup)

it.each([
  ["BOOKING_REQUEST", "A new request", "/staff"],
  ["BOOKING_STATUS_CHANGE", "Booking accepted", "/bookings/id%2Fwith%20space"],
  ["CHAT_MESSAGE", JSON.stringify({ key: "notifications.newChatMessage" }), "chat"],
])("opens the direct destination for %s", async (type, message, destination) => {
  mocks.notifications = [
    { id: "notification-1", bookingId: "id/with space", type, message, read: false },
  ]
  render(<NotificationBell />)
  await userEvent.click(screen.getByRole("button", { name: "notifications.title" }))
  await userEvent.click(screen.getAllByRole("menuitem")[0])
  expect(mocks.markRead).toHaveBeenCalledWith({ id: "notification-1" })
  if (destination === "chat") {
    expect(mocks.openChat).toHaveBeenCalledExactlyOnceWith("id/with space")
    expect(mocks.push).not.toHaveBeenCalled()
  } else {
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(destination)
    expect(mocks.openChat).not.toHaveBeenCalled()
  }
  expect(localStorage.length).toBe(0)
  expect(screen.queryByRole("menu")).toBeNull()
})
