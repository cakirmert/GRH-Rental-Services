import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AppFeedback, { AppFeedbackProvider, ReportProblemButton } from "../AppFeedback"
import AppFeedbackDialog from "../AppFeedbackDialog"
import SignedOutFeedbackDialog from "../SignedOutFeedbackDialog"
import { useEffect, useState } from "react"
import Header from "@/components/Header"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { I18nProvider } from "@/locales/i18n"
import { RELEASE_ID } from "@/constants/release"

const mocks = vi.hoisted(() => ({
  userId: "resident-1",
  role: "USER",
  status: "authenticated",
  mutate: vi.fn(),
  reset: vi.fn(),
  error: null as { data?: { code: string } } | null,
  pending: false,
  setView: vi.fn(),
  openAuthModal: vi.fn(),
  pathname: "/",
  push: vi.fn(),
}))
vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({
    status: mocks.status,
    data:
      mocks.status === "authenticated"
        ? { user: { id: mocks.userId, role: mocks.role, name: "Sample Resident" } }
        : null,
  }),
}))
vi.mock("next/dynamic", () => ({
  default: (loader: () => unknown) =>
    function RealFeedbackDialog(props: React.ComponentProps<typeof AppFeedbackDialog>) {
      return loader.toString().includes("SignedOutFeedbackDialog") ? (
        <SignedOutFeedbackDialog {...props} />
      ) : (
        <AppFeedbackDialog {...props} />
      )
    },
}))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    problemReports: {
      submit: {
        useMutation: () => ({
          mutate: mocks.mutate,
          reset: mocks.reset,
          error: mocks.error,
          isPending: mocks.pending,
        }),
      },
    },
    user: { getPasskeys: { useQuery: () => ({ data: [], isLoading: false }) } },
  },
}))
vi.mock("@/contexts/ViewContext", () => ({
  useView: () => ({ setView: mocks.setView }),
  View: { CONTACT: "contact" },
}))
vi.mock("@/contexts/AuthModalContext", () => ({
  useAuthModal: () => ({ openAuthModal: mocks.openAuthModal }),
}))
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: vi.fn() }),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}))
vi.mock("@/contexts/NamePromptContext", () => ({ useNamePrompt: () => ({ openPrompt: vi.fn() }) }))
vi.mock("@/components/NotificationBell", () => ({ default: () => null }))

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nProvider>
    <AppFeedbackProvider>
      <ReportProblemButton />
      {children}
    </AppFeedbackProvider>
  </I18nProvider>
)
const title = "The calendar does not show my selected day"
const description =
  "I chose Monday in the calendar. I expected to see Monday’s bookings, but the date stayed on Sunday. It happens after changing the week."
async function openReport() {
  await userEvent.click(screen.getByRole("button", { name: "Report a problem" }))
  await screen.findByRole("dialog")
}
async function fillReport() {
  fireEvent.change(screen.getByRole("textbox", { name: "Short title" }), {
    target: { value: title },
  })
  fireEvent.change(
    screen.getByRole("textbox", { name: "What happened, or what would you improve?" }),
    { target: { value: description } },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.openAuthModal.mockReset()
  localStorage.clear()
  mocks.userId = "resident-1"
  mocks.role = "USER"
  mocks.status = "authenticated"
  mocks.error = null
  mocks.pending = false
  mocks.pathname = "/"
})
afterEach(cleanup)

describe("app-wide problem reports", () => {
  it.each(["USER", "RENTAL", "ADMIN", "guest"])(
    "has one real header report control for %s, independent of the update notice",
    async (role) => {
      if (role === "guest") mocks.status = "unauthenticated"
      else mocks.role = role
      render(
        <I18nProvider>
          <AppFeedbackProvider>
            <Header />
            <AppFeedback />
          </AppFeedbackProvider>
        </I18nProvider>,
      )
      const header = screen.getByRole("banner")
      const controls = screen.getAllByRole("button", { name: "Report a problem" })
      expect(controls).toHaveLength(1)
      expect(header.contains(controls[0])).toBe(true)
      await userEvent.click(screen.getByRole("button", { name: "Dismiss update notice" }))
      expect(screen.queryByRole("region", { name: "App feedback" })).toBeNull()
      controls[0].focus()
      await userEvent.keyboard("{Enter}")
      expect(screen.getByRole("dialog")).toBeTruthy()
      if (role === "guest")
        expect(screen.getByRole("button", { name: "Contact us privately" })).toBeTruthy()
      else expect(screen.getByRole("textbox", { name: "Short title" })).toBeTruthy()
      await userEvent.keyboard("{Escape}")
      expect(document.activeElement).toBe(controls[0])
    },
  )

  it.each(["USER", "RENTAL", "ADMIN"])("offers reports for authenticated %s accounts", (role) => {
    mocks.role = role
    render(<AppFeedback />, { wrapper: Wrapper })
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeTruthy()
  })

  it("keeps the report control visible but disabled while the session loads", async () => {
    mocks.status = "loading"
    render(<AppFeedback />, { wrapper: Wrapper })
    const control = screen.getByRole("button", { name: "Report a problem" }) as HTMLButtonElement
    expect(control.disabled).toBe(true)
    await userEvent.click(control)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it("offers signed-out users private in-app support and a secondary email fallback", async () => {
    mocks.status = "unauthenticated"
    render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    expect(screen.getByText("You can get help even if you can’t sign in.")).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: "Short title" })).toBeNull()
    expect(screen.getByRole("link", { name: "rentals@grh-hamburg.de" }).getAttribute("href")).toBe(
      "mailto:rentals@grh-hamburg.de",
    )
    await userEvent.click(screen.getByRole("button", { name: "Contact us privately" }))
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/contact")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it("offers sign-in before a signed-out user can create a public report", async () => {
    mocks.status = "unauthenticated"
    render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    await userEvent.click(screen.getByRole("button", { name: "Sign in for a public report" }))
    expect(mocks.openAuthModal).toHaveBeenCalledExactlyOnceWith("email", "", expect.any(Function))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it("hands focus to the sign-in dialog instead of restoring it to the report trigger", async () => {
    mocks.status = "unauthenticated"
    function SignInDialog() {
      const [open, setOpen] = useState(false)
      useEffect(() => {
        mocks.openAuthModal.mockImplementation(() => setOpen(true))
      }, [])
      return (
        <Dialog open={open}>
          <DialogContent>
            <DialogTitle>Sign in to GRH</DialogTitle>
            <DialogDescription>Enter your email to continue.</DialogDescription>
            <input aria-label="Sign-in email" type="email" />
          </DialogContent>
        </Dialog>
      )
    }
    render(
      <>
        <AppFeedback />
        <SignInDialog />
      </>,
      { wrapper: Wrapper },
    )
    await openReport()
    await userEvent.click(screen.getByRole("button", { name: "Sign in for a public report" }))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Sign-in email" })),
    )
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it("routes private support directly from any page", async () => {
    mocks.status = "unauthenticated"
    mocks.pathname = "/missing-page"
    const view = render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    await userEvent.click(screen.getByRole("button", { name: "Contact us privately" }))
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/contact")
    expect(mocks.setView).not.toHaveBeenCalled()
    mocks.pathname = "/"
    view.rerender(<AppFeedback />)
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/contact")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("dismisses the update once per release/account while keeping reporting available", async () => {
    const view = render(<AppFeedback />, { wrapper: Wrapper })
    expect(screen.getByText("We’ve updated GRH Rentals.")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "Dismiss update notice" }))
    expect(screen.queryByText("We’ve updated GRH Rentals.")).toBeNull()
    const trigger = screen.getByRole("button", { name: "Report a problem" })
    expect(document.activeElement).toBe(trigger)
    expect(localStorage.getItem(`grh-update-notice:${RELEASE_ID}:resident-1`)).toBe("1")
    view.unmount()
    render(<AppFeedback />, { wrapper: Wrapper })
    expect(screen.queryByText("We’ve updated GRH Rentals.")).toBeNull()
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeTruthy()
  })

  it("does not reuse another account or an earlier release’s notice dismissal", () => {
    localStorage.setItem(`grh-update-notice:${RELEASE_ID}:other-user`, "1")
    localStorage.setItem("grh-update-notice:0.1.0:resident-1", "1")
    render(<AppFeedback />, { wrapper: Wrapper })
    expect(screen.getByText("We’ve updated GRH Rentals.")).toBeTruthy()
  })

  it("discloses public posting, attaches no private metadata, and requires unchecked consent", async () => {
    render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    expect(screen.getByText("Your report will be public on GitHub")).toBeTruthy()
    expect(screen.getByText(/The app copy is removed after 30 days/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "contact us privately" }).getAttribute("href")).toBe(
      "/contact",
    )
    const consent = screen.getByRole("checkbox", { name: /I understand/ }) as HTMLInputElement
    expect(consent.checked).toBe(false)
    await fillReport()
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    expect(mocks.mutate).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(consent)
    expect(consent.getAttribute("aria-invalid")).toBe("true")
    await userEvent.click(consent)
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(
      {
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        category: "problem",
        title,
        description,
        publicPostingConsent: true,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    expect(Object.keys(mocks.mutate.mock.calls[0][0]).sort()).toEqual([
      "category",
      "description",
      "publicPostingConsent",
      "requestId",
      "title",
    ])
  })

  it("focuses the first invalid field and bounds meaningful trimmed text", async () => {
    render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    const titleField = screen.getByRole("textbox", { name: "Short title" })
    expect(document.activeElement).toBe(titleField)
    expect(titleField.getAttribute("aria-describedby")).toBe("app-report-title-error")
    await userEvent.type(titleField, "     ")
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    expect(mocks.mutate).not.toHaveBeenCalled()
    await userEvent.clear(titleField)
    await userEvent.type(titleField, "A useful title")
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: /What happened/ }))
  })

  it("opens private support through the app’s existing contact view", async () => {
    render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    await userEvent.click(screen.getByRole("link", { name: "contact us privately" }))
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/contact")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it("preserves an unchanged draft and UUID after an ambiguous error, including close/reopen", async () => {
    const view = render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    await fillReport()
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand/ }))
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    const first = mocks.mutate.mock.calls[0][0]
    mocks.error = { data: { code: "INTERNAL_SERVER_ERROR" } }
    view.rerender(<AppFeedback />)
    expect(screen.getByRole("alert").textContent).toContain("We couldn’t confirm submission")
    expect((screen.getByRole("textbox", { name: "Short title" }) as HTMLInputElement).value).toBe(
      title,
    )
    expect(
      (screen.getByRole("textbox", { name: "Short title" }) as HTMLInputElement).readOnly,
    ).toBe(true)
    await userEvent.keyboard("{Escape}")
    await openReport()
    expect(
      (screen.getByRole("textbox", { name: /What happened/ }) as HTMLTextAreaElement).value,
    ).toBe(description)
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    expect(mocks.mutate.mock.calls[1][0]).toEqual(first)
    expect(localStorage.length).toBe(0)
  })

  it("prevents duplicate clicks or dismissal while submission is pending", async () => {
    const view = render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    await fillReport()
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand/ }))
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    mocks.pending = true
    view.rerender(<AppFeedback />)
    expect(
      (screen.getByRole("button", { name: "Submitting…" }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await userEvent.keyboard("{Escape}")
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(mocks.mutate).toHaveBeenCalledOnce()
  })

  it.each([
    ["queued", "Your report is saved for delivery to GitHub."],
    ["needs_review", "Saved for a delivery check. It may already be on GitHub."],
  ])("shows %s as saved rather than publicly delivered", async (status, message) => {
    render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    await fillReport()
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand/ }))
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    act(() =>
      mocks.mutate.mock.calls[0][1].onSuccess({ id: "sample-report", status, issueUrl: null }),
    )
    expect(screen.getByRole("status").textContent).toContain(message)
    expect(screen.queryByText("Your report has been posted on GitHub.")).toBeNull()
    expect(screen.queryByRole("link", { name: /View public report/ })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("status")))
  })

  it("shows a published issue link and generates a new UUID only for a new report", async () => {
    render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    await fillReport()
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand/ }))
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    const firstId = mocks.mutate.mock.calls[0][0].requestId
    const url = "https://github.com/cakirmert/GRH-Rental-Services/issues/123"
    act(() =>
      mocks.mutate.mock.calls[0][1].onSuccess({
        id: "sample-report",
        status: "published",
        issueUrl: url,
      }),
    )
    expect(screen.getByRole("link", { name: /View public report/ }).getAttribute("href")).toBe(url)
    await userEvent.click(screen.getByRole("button", { name: "Send another report" }))
    expect(
      (screen.getByRole("checkbox", { name: /I understand/ }) as HTMLInputElement).checked,
    ).toBe(false)
    await fillReport()
    await userEvent.click(screen.getByRole("radio", { name: "Feedback or idea" }))
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand/ }))
    await userEvent.click(screen.getByRole("button", { name: "Submit public report" }))
    expect(mocks.mutate.mock.calls[1][0].requestId).not.toBe(firstId)
    expect(mocks.mutate.mock.calls[1][0].category).toBe("feedback")
  })

  it("resets drafts, consent, and dialogs when accounts change or sign out", async () => {
    const view = render(<AppFeedback />, { wrapper: Wrapper })
    await openReport()
    await fillReport()
    await userEvent.click(screen.getByRole("checkbox", { name: /I understand/ }))
    mocks.userId = "resident-2"
    view.rerender(<AppFeedback />)
    expect(screen.queryByRole("dialog")).toBeNull()
    await openReport()
    expect((screen.getByRole("textbox", { name: "Short title" }) as HTMLInputElement).value).toBe(
      "",
    )
    expect(
      (screen.getByRole("checkbox", { name: /I understand/ }) as HTMLInputElement).checked,
    ).toBe(false)
    mocks.status = "unauthenticated"
    view.rerender(<AppFeedback />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeTruthy()
    await openReport()
    expect(screen.queryByRole("textbox", { name: "Short title" })).toBeNull()
    expect(screen.getByRole("button", { name: "Contact us privately" })).toBeTruthy()
  })

  it("resets report drafts without remounting the current page on account changes", async () => {
    function PageState() {
      const [value, setValue] = useState("")
      return (
        <input
          aria-label="Current booking draft"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )
    }
    const view = render(<PageState />, { wrapper: Wrapper })
    await userEvent.type(
      screen.getByRole("textbox", { name: "Current booking draft" }),
      "Keep this page state",
    )
    await openReport()
    await fillReport()
    mocks.userId = "another-account"
    view.rerender(<PageState />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(
      (screen.getByRole("textbox", { name: "Current booking draft" }) as HTMLInputElement).value,
    ).toBe("Keep this page state")
    await openReport()
    expect((screen.getByRole("textbox", { name: "Short title" }) as HTMLInputElement).value).toBe(
      "",
    )
  })

  it("restores keyboard focus when a draft closes and localizes German disclosure", async () => {
    localStorage.setItem("grh-booking-language", "de")
    render(<AppFeedback />, { wrapper: Wrapper })
    const trigger = screen.getByRole("button", { name: "Problem melden" })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    expect(screen.getByText("Deine Meldung wird auf GitHub öffentlich sein")).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: /öffentlich auf GitHub/ })).toBeTruthy()
    await userEvent.keyboard("{Escape}")
    expect(document.activeElement).toBe(trigger)
  })
})
