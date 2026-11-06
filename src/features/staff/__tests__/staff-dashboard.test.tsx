import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { I18nProvider } from "@/locales/i18n"
import StaffDashboardFeature from "../StaffDashboardFeature"

const mocks = vi.hoisted(() => ({
  actor: { id: "staff-a", role: "RENTAL", status: "authenticated" },
  list: vi.fn(),
  note: vi.fn<
    (input: { bookingId: string; note: string }) => Promise<{ id: string; notes: string }>
  >(),
  status:
    vi.fn<
      (input: { bookingId: string; newStatus: string }) => Promise<{ id: string; status: string }>
    >(),
  chat: vi.fn(),
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: mocks.actor }, status: mocks.actor.status }),
}))
vi.mock("@/components/NotAuthorized", () => ({ default: () => <p>Staff access required</p> }))
vi.mock("@/components/DashboardHelpSheet", () => ({ default: () => null }))
vi.mock("@/components/calendar/calendar", () => ({ Calendar: () => <p>Staff calendar</p> }))
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }))
vi.mock("@/utils/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  return {
    trpc: {
      useUtils: () => ({ bookings: { listForRentalTeam: { invalidate: vi.fn() } } }),
      bookings: {
        listForRentalTeam: { useInfiniteQuery: mocks.list },
        addRentalNote: {
          useMutation: (options: object = {}) =>
            useMutation({ mutationFn: mocks.note, ...options }),
        },
        updateBookingStatusByTeam: {
          useMutation: (options: object = {}) =>
            useMutation({ mutationFn: mocks.status, ...options }),
        },
      },
    },
  }
})
const booking = {
  id: "synthetic-booking",
  status: "REQUESTED",
  notes: null,
  quantity: 1,
  startDate: new Date("2030-07-15T12:00:00Z"),
  endDate: new Date("2030-07-15T14:00:00Z"),
  item: { id: "bar", titleEn: "Bar", titleDe: "Bar", type: "ROOM", totalQuantity: 1 },
  user: { id: "resident", name: "Alex Example", email: "alex@example.test" },
  assignedTo: null,
}
let client: QueryClient
function page(view?: "list" | "calendar") {
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        <StaffDashboardFeature onGoBack={vi.fn()} onOpenChat={mocks.chat} view={view} />
      </I18nProvider>
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.actor.id = "staff-a"
  mocks.actor.role = "RENTAL"
  mocks.actor.status = "authenticated"
  mocks.note.mockResolvedValue({ id: booking.id, notes: "Saved" })
  mocks.status.mockResolvedValue({ id: booking.id, status: "DECLINED" })
  mocks.list.mockReturnValue({
    data: { pages: [{ bookings: [booking], nextCursor: null }] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
  })
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
})
afterEach(() => {
  cleanup()
  client.clear()
})

it.each([
  ["USER", "authenticated"],
  ["ADMIN", "unauthenticated"],
])("does not fetch staff data for %s while %s", (role, status) => {
  mocks.actor.role = role
  mocks.actor.status = status
  render(page())
  expect(screen.getByText("Staff access required")).toBeTruthy()
  expect(mocks.list).not.toHaveBeenCalled()
})

it("waits for the staff session without showing an access error or fetching protected data", () => {
  mocks.actor.status = "loading"
  const view = render(page())
  expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy()
  expect(screen.queryByText("Staff access required")).toBeNull()
  expect(mocks.list).not.toHaveBeenCalled()
  mocks.actor.status = "authenticated"
  view.rerender(page())
  expect(screen.queryByRole("status", { name: "Loading" })).toBeNull()
  expect(screen.getByRole("heading", { name: "Rental Dashboard" })).toBeTruthy()
  expect(mocks.list).toHaveBeenCalled()
})

it("uses injected chat navigation and keeps list requests disabled in calendar mode", async () => {
  const view = render(page())
  await userEvent.click(screen.getByRole("button", { name: /Chat with Alex/ }))
  expect(mocks.chat).toHaveBeenCalledExactlyOnceWith(booking.id)
  expect(localStorage.getItem("grh-open-chat-booking-id")).toBeNull()
  view.rerender(page("calendar"))
  expect(screen.getByText("Staff calendar")).toBeTruthy()
  expect(screen.queryByLabelText("Search bookings")).toBeNull()
  expect(mocks.list).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ enabled: false }),
  )
})

it("requires a decline reason and saves it before changing status", async () => {
  let resolve!: (value: { id: string; notes: string }) => void
  mocks.note.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  render(page())
  await userEvent.click(screen.getByRole("button", { name: "Decline" }))
  const dialog = within(screen.getByRole("dialog"))
  expect((dialog.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(dialog.getByRole("textbox"), { target: { value: "  Room maintenance  " } })
  await userEvent.click(dialog.getByRole("button", { name: "Confirm" }))
  await waitFor(() => expect(mocks.note).toHaveBeenCalled())
  expect(mocks.note.mock.calls[0][0]).toEqual({ bookingId: booking.id, note: "Room maintenance" })
  expect(mocks.status).not.toHaveBeenCalled()
  expect((dialog.getByRole("button", { name: /Confirm$/ }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  await act(async () => {
    resolve({ id: booking.id, notes: "Room maintenance" })
  })
  await waitFor(() => expect(mocks.status).toHaveBeenCalled())
  expect(mocks.status.mock.calls[0][0]).toEqual({ bookingId: booking.id, newStatus: "DECLINED" })
})

it("keeps the reason after a failed note save and never changes status", async () => {
  mocks.note.mockRejectedValue(new Error("Offline"))
  render(page())
  await userEvent.click(screen.getByRole("button", { name: "Decline" }))
  const dialog = within(screen.getByRole("dialog"))
  fireEvent.change(dialog.getByRole("textbox"), { target: { value: "Room maintenance" } })
  await userEvent.click(dialog.getByRole("button", { name: "Confirm" }))
  await waitFor(() =>
    expect((dialog.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  )
  expect(dialog.getByDisplayValue("Room maintenance")).toBeTruthy()
  expect(mocks.status).not.toHaveBeenCalled()
})

it("drops private action state and stops a pending two-step action after an account switch", async () => {
  let resolve!: (value: { id: string; notes: string }) => void
  mocks.note.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const view = render(page())
  await userEvent.click(screen.getByRole("button", { name: "Decline" }))
  const dialog = within(screen.getByRole("dialog"))
  fireEvent.change(dialog.getByRole("textbox"), { target: { value: "Private first-account note" } })
  await userEvent.click(dialog.getByRole("button", { name: "Confirm" }))
  await waitFor(() => expect(mocks.note).toHaveBeenCalled())
  mocks.actor.id = "staff-b"
  view.rerender(page())
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(screen.queryByDisplayValue("Private first-account note")).toBeNull()
  await act(async () => {
    resolve({ id: booking.id, notes: "Saved for first account" })
  })
  expect(mocks.status).not.toHaveBeenCalled()
})
