import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { AuthModalProvider } from "@/contexts/AuthModalContext"
import { I18nProvider } from "@/locales/i18n"
import { AppFeedbackProvider, ReportProblemButton } from "../AppFeedback"
import SignedOutFeedbackDialog from "../SignedOutFeedbackDialog"

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated", update: vi.fn() }),
  signIn: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}))
vi.mock("@/contexts/ViewContext", () => ({
  useView: () => ({ setView: vi.fn() }),
  View: { CONTACT: "contact" },
}))
vi.mock("@/lib/webauthnUtils", () => ({ isPasskeySupported: () => false }))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    webauthn: {
      loginOptions: { useMutation: () => ({ mutateAsync: vi.fn() }) },
      login: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
  },
}))
vi.mock("next/dynamic", () => ({
  default: () =>
    function GuestDialog(props: React.ComponentProps<typeof SignedOutFeedbackDialog>) {
      return <SignedOutFeedbackDialog {...props} />
    },
}))

beforeEach(() => {
  localStorage.clear()
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

it("returns focus from the real authentication provider to the header report control", async () => {
  render(
    <I18nProvider>
      <AuthModalProvider>
        <AppFeedbackProvider>
          <ReportProblemButton />
        </AppFeedbackProvider>
      </AuthModalProvider>
    </I18nProvider>,
  )
  const trigger = screen.getByRole("button", { name: "Report a problem" })
  await userEvent.click(trigger)
  await userEvent.click(screen.getByRole("button", { name: "Sign in for a public report" }))
  const email = screen.getByRole("textbox", { name: /Email/ })
  await waitFor(() => expect(document.activeElement).toBe(email))
  await userEvent.keyboard("{Escape}")
  await waitFor(() => expect(document.activeElement).toBe(trigger))
  expect(screen.queryByRole("dialog")).toBeNull()
})
