import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ChatDialog from "../ChatDialog"
import { I18nProvider } from "@/locales/i18n"

const mocks = vi.hoisted(() => ({
  status: "authenticated",
  pending: false,
  query: vi.fn(),
  send: vi.fn(),
  markRead: vi.fn(),
  refetch: vi.fn(),
  queryState: {
    data: { pages: [{ messages: [] as unknown[] }] } as
      { pages: { messages: unknown[] }[] } | undefined,
    error: null as { data?: { code: string }; message: string } | null,
    isPending: false,
    isSuccess: true,
    isFetching: false,
    hasNextPage: false,
  },
}))
vi.mock("@/features/identity/client", () => ({
  useCurrentAccount: () => ({
    status: mocks.status,
    user: mocks.status === "authenticated" ? { id: "synthetic-me", role: "USER" } : null,
  }),
}))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    useUtils: () => ({ chat: { list: { invalidate: vi.fn() } } }),
    chat: {
      list: {
        useInfiniteQuery: (input: unknown, options: unknown) => {
          mocks.query(input, options)
          return { ...mocks.queryState, refetch: mocks.refetch, fetchNextPage: vi.fn() }
        },
      },
      send: { useMutation: () => ({ mutate: mocks.send, isPending: mocks.pending }) },
      markRead: { useMutation: () => ({ mutate: mocks.markRead }) },
    },
  },
}))

const props = { open: true, bookingId: "synthetic-booking", onOpenChange: vi.fn() }
function showChat(locale: "en" | "de" = "en") {
  return render(<ChatDialog {...props} />, {
    wrapper: ({ children }) => <I18nProvider initialLocale={locale}>{children}</I18nProvider>,
  })
}
function message() {
  return {
    id: "synthetic-message",
    sender: { id: "synthetic-me", name: "Synthetic" },
    body: "Private cached conversation",
    createdAt: new Date("2026-11-06T10:00:00Z"),
    reads: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.status = "authenticated"
  mocks.pending = false
  Object.assign(mocks.queryState, {
    data: { pages: [{ messages: [] }] },
    error: null,
    isPending: false,
    isSuccess: true,
    isFetching: false,
    hasNextPage: false,
  })
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (Element.prototype as Partial<Element>).scrollIntoView
})

describe("conversation loading and access", () => {
  it("waits for verified identity without querying or enabling the composer", () => {
    mocks.status = "loading"
    showChat()
    expect(mocks.query).toHaveBeenCalledWith(
      { bookingId: props.bookingId, limit: 30 },
      expect.objectContaining({ enabled: false }),
    )
    expect(screen.getByRole("status", { name: "Loading..." })).toBeTruthy()
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true)
    expect(screen.queryByText("No messages yet. Start the conversation!")).toBeNull()
  })

  it("keeps loading distinct from an empty conversation", () => {
    Object.assign(mocks.queryState, { data: undefined, isPending: true, isSuccess: false })
    showChat()
    expect(screen.getByRole("status", { name: "Loading..." })).toBeTruthy()
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText("No messages yet. Start the conversation!")).toBeNull()
  })

  it.each(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"])(
    "uses the same safe unavailable state for %s and hides cached data",
    (code) => {
      Object.assign(mocks.queryState, {
        data: { pages: [{ messages: [message()] }] },
        error: { data: { code }, message: "Private internal lookup detail" },
        isSuccess: false,
      })
      showChat()
      expect(screen.getByRole("alert").textContent).toBe(
        "This conversation is unavailable. Return to your bookings or contact the rental team.",
      )
      expect(screen.queryByText("Private cached conversation")).toBeNull()
      expect(screen.queryByText("Private internal lookup detail")).toBeNull()
      expect(screen.queryByText("No messages yet. Start the conversation!")).toBeNull()
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true)
      expect(mocks.markRead).not.toHaveBeenCalled()
    },
  )

  it("offers retry for a loading failure and cannot send using the keyboard", async () => {
    const view = showChat()
    await userEvent.type(screen.getByRole("textbox"), "Unsent draft")
    Object.assign(mocks.queryState, {
      error: { message: "Private network diagnostic", data: { code: "INTERNAL_SERVER_ERROR" } },
      isSuccess: false,
    })
    view.rerender(<ChatDialog {...props} />)
    expect(screen.getByRole("alert").textContent).toContain("Messages could not be loaded")
    expect(screen.queryByText("Private network diagnostic")).toBeNull()
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    expect(mocks.send).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
    Object.assign(mocks.queryState, { error: null, isSuccess: true })
    view.rerender(<ChatDialog {...props} />)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Unsent draft")
    await userEvent.click(screen.getByRole("button", { name: "Send" }))
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
      bookingId: props.bookingId,
      body: "Unsent draft",
    })
  })

  it("allows a message only after the empty thread loads successfully", async () => {
    showChat()
    expect(screen.getByText("No messages yet. Start the conversation!")).toBeTruthy()
    await userEvent.type(screen.getByRole("textbox"), "Hello rental team{Enter}")
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({
      bookingId: props.bookingId,
      body: "Hello rental team",
    })
  })

  it("does not submit again while a message is pending", async () => {
    const view = showChat()
    await userEvent.type(screen.getByRole("textbox"), "One message")
    mocks.pending = true
    view.rerender(<ChatDialog {...props} />)
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it("stops querying and hides cached messages after sign-out", () => {
    mocks.queryState.data = { pages: [{ messages: [message()] }] }
    const view = showChat()
    expect(screen.getByText("Private cached conversation")).toBeTruthy()
    mocks.status = "unauthenticated"
    view.rerender(<ChatDialog {...props} />)
    expect(mocks.query).toHaveBeenLastCalledWith(
      { bookingId: props.bookingId, limit: 30 },
      expect.objectContaining({ enabled: false }),
    )
    expect(screen.queryByText("Private cached conversation")).toBeNull()
    expect(screen.getByRole("alert").textContent).toContain("This conversation is unavailable")
  })

  it("does not poll while closed", () => {
    const view = showChat()
    view.rerender(<ChatDialog {...props} open={false} />)
    expect(mocks.query).toHaveBeenLastCalledWith(
      { bookingId: props.bookingId, limit: 30 },
      expect.objectContaining({ enabled: false }),
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("localizes a failed conversation and retry action in German", () => {
    Object.assign(mocks.queryState, { error: { message: "Network failure" }, isSuccess: false })
    showChat("de")
    expect(screen.getByRole("alert").textContent).toContain(
      "Nachrichten konnten nicht geladen werden",
    )
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Zurück" })).toBeTruthy()
  })
})
