import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import AdminDashboardView from "../AdminDashboardView"
import { I18nProvider } from "@/locales/i18n"

const mocks = vi.hoisted(() => ({
  session: undefined as { user: { id: string; role: string } } | undefined,
  stats: vi.fn(),
  accounts: vi.fn(),
  members: vi.fn(),
  deleteAccount: vi.fn(),
}))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: mocks.session }) }))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    useUtils: () => ({ invalidate: vi.fn() }),
    admin: {
      dashboardStats: { useQuery: mocks.stats },
      inactiveAccounts: { useInfiniteQuery: mocks.accounts },
      deleteInactiveAccount: {
        useMutation: () => ({ mutate: mocks.deleteAccount, reset: vi.fn(), isPending: false }),
      },
      memberManagement: {
        list: { useQuery: mocks.members },
        ...Object.fromEntries(
          ["add", "remove", "promoteToAdmin", "demoteFromAdmin"].map((name) => [
            name,
            { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
          ]),
        ),
      },
    },
  },
}))
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }))
vi.mock("../admin/ProfilesTab", () => ({ default: () => <p>Profiles view</p> }))
vi.mock("../admin/ItemsTab", () => ({ default: () => <p>Items view</p> }))
vi.mock("../admin/CancelledByStaffTab", () => ({ default: () => <p>Cancellations view</p> }))
vi.mock("../calendar/calendar", () => ({ Calendar: () => <p>Calendar view</p> }))
vi.mock("../DashboardHelpSheet", () => ({ default: () => null }))
vi.mock("../NotAuthorized", () => ({ default: () => <p>Administrator access required</p> }))

const inactiveMember = {
  id: "inactive-staff",
  name: "Alex Sample",
  email: "alex@example.test",
  role: "RENTAL",
  isSuperAdmin: false,
  isInactiveStaff: true,
  lastLoginAt: new Date("2025-10-01T12:00:00Z"),
  lastActiveAt: new Date("2025-10-02T12:00:00Z"),
  blockers: [],
  counts: { ownBookings: 0, assignedBookings: 0, responsibleItems: 0 },
  canDelete: true,
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mocks.session = undefined
  mocks.stats.mockReturnValue({ data: undefined, isLoading: false, error: null })
  mocks.members.mockReturnValue({ data: [inactiveMember], isLoading: false, refetch: vi.fn() })
  mocks.accounts.mockReturnValue({
    data: { pages: [{ accounts: [inactiveMember], nextCursor: null }] },
    isLoading: false,
    isError: false,
    isFetching: false,
    isFetchedAfterMount: true,
    hasNextPage: false,
    refetch: vi.fn(),
  })
})
afterEach(cleanup)

it("keeps hook order stable across session changes and only enables statistics for admins", () => {
  const view = render(
    <I18nProvider>
      <AdminDashboardView onGoBack={vi.fn()} />
    </I18nProvider>,
  )
  expect(screen.getByText("Administrator access required")).toBeTruthy()
  expect(mocks.stats).toHaveBeenLastCalledWith(
    undefined,
    expect.objectContaining({ enabled: false }),
  )
  mocks.session = { user: { id: "admin", role: "ADMIN" } }
  view.rerender(
    <I18nProvider>
      <AdminDashboardView onGoBack={vi.fn()} />
    </I18nProvider>,
  )
  expect(screen.getByRole("button", { name: /Inactive staff/ })).toBeTruthy()
  expect(mocks.stats).toHaveBeenLastCalledWith(
    undefined,
    expect.objectContaining({ enabled: true }),
  )
  mocks.session = { user: { id: "admin", role: "USER" } }
  view.rerender(
    <I18nProvider>
      <AdminDashboardView onGoBack={vi.fn()} />
    </I18nProvider>,
  )
  expect(screen.getByText("Administrator access required")).toBeTruthy()
  expect(mocks.stats).toHaveBeenLastCalledWith(
    undefined,
    expect.objectContaining({ enabled: false }),
  )
})

it("opens normal review from home and deletes via badge then confirmation in exactly two clicks", async () => {
  mocks.session = { user: { id: "admin", role: "ADMIN" } }
  render(
    <I18nProvider>
      <AdminDashboardView onGoBack={vi.fn()} />
    </I18nProvider>,
  )
  await userEvent.click(screen.getByRole("button", { name: /Inactive staff/ }))
  expect(screen.getByRole("heading", { name: "Inactive staff" })).toBeTruthy()
  expect(screen.queryByRole("alertdialog")).toBeNull()
  await userEvent.click(screen.getByRole("tab", { name: "Manage Team Members" }))
  await userEvent.click(screen.getByRole("button", { name: "Review inactive staff: Alex Sample" }))
  expect(mocks.accounts).toHaveBeenLastCalledWith(
    { limit: 25, userId: inactiveMember.id },
    expect.objectContaining({ refetchOnMount: "always" }),
  )
  expect(screen.getByRole("alertdialog")).toBeTruthy()
  expect(mocks.deleteAccount).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole("button", { name: "Confirm deletion" }))
  expect(mocks.deleteAccount).toHaveBeenCalledExactlyOnceWith({
    userId: inactiveMember.id,
    expectedLastLoginAt: inactiveMember.lastLoginAt,
    expectedLastActiveAt: inactiveMember.lastActiveAt,
  })
})
