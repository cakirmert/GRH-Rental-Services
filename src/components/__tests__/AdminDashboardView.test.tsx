import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import AdminDashboardView from "../AdminDashboardView"
import { I18nProvider } from "@/locales/i18n"

const mocks = vi.hoisted(() => ({
  session: undefined as { user: { id: string; role: string } } | undefined,
  stats: vi.fn(),
}))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: mocks.session }) }))
vi.mock("@/utils/trpc", () => ({ trpc: { admin: { dashboardStats: { useQuery: mocks.stats } } } }))
vi.mock("../admin/ProfilesTab", () => ({ default: () => <p>Profiles view</p> }))
vi.mock("../admin/ItemsTab", () => ({ default: () => <p>Items view</p> }))
vi.mock("../admin/CancelledByStaffTab", () => ({ default: () => <p>Cancellations view</p> }))
vi.mock("../admin/InactiveAccountsTab", () => ({
  default: () => <p>Inactive staff review view</p>,
}))
vi.mock("../admin/MembersTab", () => ({
  default: ({ onReviewInactive }: { onReviewInactive: () => void }) => (
    <button onClick={onReviewInactive}>Review inactive staff member</button>
  ),
}))
vi.mock("../calendar/calendar", () => ({ Calendar: () => <p>Calendar view</p> }))
vi.mock("../DashboardHelpSheet", () => ({ default: () => null }))
vi.mock("../NotAuthorized", () => ({ default: () => <p>Administrator access required</p> }))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mocks.session = undefined
  mocks.stats.mockReturnValue({ data: undefined, isLoading: false, error: null })
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

it("opens staff review from the home shortcut and from a member notification", async () => {
  mocks.session = { user: { id: "admin", role: "ADMIN" } }
  render(
    <I18nProvider>
      <AdminDashboardView onGoBack={vi.fn()} />
    </I18nProvider>,
  )
  await userEvent.click(screen.getByRole("button", { name: /Inactive staff/ }))
  expect(screen.getByText("Inactive staff review view")).toBeTruthy()
  await userEvent.click(screen.getByRole("tab", { name: "Manage Team Members" }))
  await userEvent.click(screen.getByRole("button", { name: "Review inactive staff member" }))
  expect(screen.getByText("Inactive staff review view")).toBeTruthy()
  expect(screen.getByRole("tab", { name: "Inactive staff" }).getAttribute("aria-selected")).toBe(
    "true",
  )
})
