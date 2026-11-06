import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import InactiveAccountsTab from "../InactiveAccountsTab"
import MembersTab from "../MembersTab"
import { I18nProvider } from "@/locales/i18n"

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutate: vi.fn(),
  reset: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  more: vi.fn(),
  onSuccess: undefined as (() => void) | undefined,
  error: null as { message: string } | null,
  pending: false,
  members: vi.fn(),
}))

vi.mock("@/utils/trpc", () => ({
  trpc: {
    useUtils: () => ({ invalidate: mocks.invalidate }),
    admin: {
      memberManagement: {
        list: { useQuery: mocks.members },
        ...Object.fromEntries(
          ["add", "remove", "promoteToAdmin", "demoteFromAdmin"].map((name) => [
            name,
            { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
          ]),
        ),
      },
      inactiveAccounts: { useInfiniteQuery: mocks.query },
      deleteInactiveAccount: {
        useMutation: (options: { onSuccess: () => void }) => {
          mocks.onSuccess = options.onSuccess
          return {
            mutate: mocks.mutate,
            reset: mocks.reset,
            error: mocks.error,
            isPending: mocks.pending,
          }
        },
      },
    },
  },
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "viewer", role: "ADMIN", isSuperAdmin: true } } }),
}))
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }))

const eligible = {
  id: "rental-1",
  name: "Alex Sample",
  email: "alex@example.test",
  role: "RENTAL",
  isSuperAdmin: false,
  lastLoginAt: new Date("2025-10-02T09:00:00Z"),
  lastActiveAt: new Date("2025-10-04T10:30:00Z"),
  blockers: [],
  counts: { ownBookings: 0, assignedBookings: 0, responsibleItems: 0 },
  canDelete: true,
}
const blocked = {
  ...eligible,
  id: "staff-1",
  name: "Sam Sample",
  role: "RENTAL",
  email: "sam@example.test",
  blockers: ["ownBookings", "assignedBookings", "responsibleItems"],
  counts: { ownBookings: 1, assignedBookings: 2, responsibleItems: 3 },
  canDelete: false,
}
const protectedAccount = {
  ...eligible,
  id: "admin-1",
  name: "Robin Sample",
  role: "ADMIN",
  email: "robin@example.test",
  blockers: ["protectedAccount"],
  canDelete: false,
}

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider>{children}</I18nProvider>
)
function queryState(accounts = [eligible, blocked, protectedAccount]) {
  return {
    data: { pages: [{ accounts, nextCursor: null }] },
    isLoading: false,
    isError: false,
    isFetching: false,
    isFetchedAfterMount: true,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: mocks.refetch,
    fetchNextPage: mocks.more,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("TZ", "America/New_York")
  localStorage.clear()
  mocks.error = null
  mocks.pending = false
  mocks.query.mockReturnValue(queryState())
  mocks.members.mockReturnValue({
    data: [{ ...eligible, isInactiveStaff: true }],
    isLoading: false,
    refetch: vi.fn(),
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe("inactive account review", () => {
  it("links the inactive notification beside a member name to staff review", async () => {
    const openReview = vi.fn()
    render(<MembersTab onReviewInactive={openReview} />, { wrapper: Wrapper })
    const row = screen.getByRole("row", { name: /Alex Sample/ })
    await userEvent.click(
      within(row).getByRole("button", { name: "Review inactive staff: Alex Sample" }),
    )
    expect(openReview).toHaveBeenCalledExactlyOnceWith(eligible.id)
  })
  it("shows inactive notices beside names, Berlin activity time, and all handover blockers", () => {
    render(<InactiveAccountsTab />, { wrapper: Wrapper })
    const resident = screen.getByRole("article", { name: "Alex Sample" })
    expect(within(resident).getByText("Inactive · 365+ days")).toBeTruthy()
    expect(within(resident).getByText("04 Oct 2025 · 12:30")).toBeTruthy()
    expect(within(resident).getByText("Last active")).toBeTruthy()
    expect(screen.getByText("Open or upcoming bookings: 1")).toBeTruthy()
    expect(screen.getByText("Bookings assigned to this person: 2")).toBeTruthy()
    expect(screen.getByText("Items to hand over: 3")).toBeTruthy()
    expect(
      (screen.getByRole("button", { name: "Delete account: Sam Sample" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole("button", { name: "Delete account: Robin Sample" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it("waits for fresh targeted eligibility instead of opening from cached data", () => {
    mocks.query.mockReturnValue({
      ...queryState([eligible]),
      isFetching: true,
      isFetchedAfterMount: false,
    })
    const view = render(<InactiveAccountsTab requestedReviewId={eligible.id} />, {
      wrapper: Wrapper,
    })
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(screen.getByRole("status").textContent).toContain("Loading inactive staff")
    mocks.query.mockReturnValue(queryState([eligible]))
    view.rerender(<InactiveAccountsTab requestedReviewId={eligible.id} />)
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it.each([blocked, protectedAccount])(
    "shows blockers instead of confirmation for $name",
    (account) => {
      mocks.query.mockReturnValue(queryState([account]))
      render(<InactiveAccountsTab requestedReviewId={account.id} />, { wrapper: Wrapper })
      expect(screen.queryByRole("alertdialog")).toBeNull()
      expect(
        (
          screen.getByRole("button", {
            name: `Delete account: ${account.name}`,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true)
      expect(
        screen.getByText(
          account.id === blocked.id ? "Open or upcoming bookings: 1" : /Protected account/,
        ),
      ).toBeTruthy()
      expect(mocks.mutate).not.toHaveBeenCalled()
    },
  )

  it("does not reopen a targeted confirmation after keyboard cancellation", async () => {
    const view = render(<InactiveAccountsTab requestedReviewId={eligible.id} />, {
      wrapper: Wrapper,
    })
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    await userEvent.keyboard("{Escape}")
    view.rerender(<InactiveAccountsTab requestedReviewId={eligible.id} />)
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Inactive staff" }))
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it("explains a target that became active and offers the full staff list", async () => {
    mocks.query.mockReturnValue(queryState([]))
    const showAll = vi.fn()
    render(<InactiveAccountsTab requestedReviewId={eligible.id} onShowAll={showAll} />, {
      wrapper: Wrapper,
    })
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(screen.getByText("This account no longer needs inactivity review")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Show all inactive staff" }))
    expect(showAll).toHaveBeenCalledOnce()
  })

  it("requires the second confirmation click and sends the reviewed activity timestamps", async () => {
    render(<InactiveAccountsTab />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole("button", { name: "Delete account: Alex Sample" }))
    const dialog = screen.getByRole("alertdialog")
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(within(dialog).getByText(/bookings, messages, and passkeys/)).toBeTruthy()
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Keep account" }),
    )
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm deletion" }))
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith({
      userId: eligible.id,
      expectedLastLoginAt: eligible.lastLoginAt,
      expectedLastActiveAt: eligible.lastActiveAt,
    })
  })

  it("supports keyboard review and Escape returns focus without deleting", async () => {
    render(<InactiveAccountsTab />, { wrapper: Wrapper })
    const trigger = screen.getByRole("button", { name: "Delete account: Alex Sample" })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it("keeps a failed deletion visible and requires fresh review before another attempt", async () => {
    const view = render(<InactiveAccountsTab />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole("button", { name: "Delete account: Alex Sample" }))
    await userEvent.click(screen.getByRole("button", { name: "Confirm deletion" }))
    mocks.error = { message: "The account changed" }
    view.rerender(<InactiveAccountsTab />)
    expect(screen.getByRole("alert").textContent).toContain("The account was not deleted")
    expect(
      (screen.getByRole("button", { name: "Confirm deletion" }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await userEvent.click(screen.getByRole("button", { name: "Refresh list" }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(mocks.mutate).toHaveBeenCalledOnce()
  })

  it("disables repeat deletion while pending and invalidates cached account data after success", async () => {
    const view = render(<InactiveAccountsTab />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole("button", { name: "Delete account: Alex Sample" }))
    mocks.pending = true
    view.rerender(<InactiveAccountsTab />)
    expect((screen.getByRole("button", { name: "Deleting…" }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(
      (screen.getByRole("button", { name: "Keep account" }) as HTMLButtonElement).disabled,
    ).toBe(true)
    act(() => mocks.onSuccess?.())
    expect(mocks.invalidate).toHaveBeenCalledOnce()
    expect(screen.getByRole("status").textContent).toBe("Account deleted.")
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("loads the next page without replacing the current review list", async () => {
    mocks.query.mockReturnValue({ ...queryState(), hasNextPage: true })
    render(<InactiveAccountsTab />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole("button", { name: "Show more accounts" }))
    expect(mocks.more).toHaveBeenCalledOnce()
    const cursor = { lastLoginAt: eligible.lastLoginAt, id: eligible.id }
    const options = mocks.query.mock.calls[0][1]
    expect(options.getNextPageParam({ nextCursor: cursor })).toBe(cursor)
    expect(options.getNextPageParam({ nextCursor: null })).toBeUndefined()
  })

  it("shows explicit loading, retry, and empty states", async () => {
    mocks.query.mockReturnValue({ ...queryState(), data: undefined, isLoading: true })
    const view = render(<InactiveAccountsTab />, { wrapper: Wrapper })
    expect(screen.getByRole("status").textContent).toContain("Loading inactive staff")
    mocks.query.mockReturnValue({ ...queryState(), data: undefined, isError: true })
    view.rerender(<InactiveAccountsTab />)
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
    mocks.query.mockReturnValue(queryState([]))
    view.rerender(<InactiveAccountsTab />)
    expect(screen.getByText("No inactive staff to review")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Delete account/ })).toBeNull()
  })

  it("localizes the review and destructive confirmation in German", async () => {
    localStorage.setItem("grh-booking-language", "de")
    render(<InactiveAccountsTab />, { wrapper: Wrapper })
    expect(screen.getByRole("heading", { name: "Inaktive Teammitglieder" })).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Konto löschen: Alex Sample" }))
    expect(screen.getByRole("button", { name: "Löschung bestätigen" })).toBeTruthy()
    expect(screen.getByText(/Buchungen, Nachrichten und Passkeys/)).toBeTruthy()
  })
})
