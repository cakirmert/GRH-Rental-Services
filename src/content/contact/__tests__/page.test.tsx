import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ContactPage from "../page"
import { I18nProvider, useI18n } from "@/locales/i18n"

const mocks = vi.hoisted(() => ({
  user: { id: "a", email: "a@example.test" } as { id: string; email: string } | null,
  fetch: vi.fn(),
}))
vi.mock("@/features/identity/client", () => ({ useCurrentAccount: () => ({ user: mocks.user }) }))
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
function LocaleSwitch() {
  const { setLocale } = useI18n()
  return <button onClick={() => setLocale("de")}>Switch language</button>
}
function show() {
  return render(<ContactPage />, {
    wrapper: ({ children }) => (
      <I18nProvider>
        <LocaleSwitch />
        {children}
      </I18nProvider>
    ),
  })
}
function field(id: string) {
  return document.getElementById(id) as HTMLInputElement
}
beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mocks.user = { id: "a", email: "a@example.test" }
  mocks.fetch.mockResolvedValue({ ok: true })
  vi.stubGlobal("fetch", mocks.fetch)
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "")
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("contact account-local drafts", () => {
  it("derives the current account email immediately without replacing the rest of the draft", async () => {
    const view = show()
    expect(screen.getByText("a@example.test")).toBeTruthy()
    expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull()
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "My draft")
    mocks.user = { id: "a", email: "new@example.test" }
    view.rerender(<ContactPage />)
    expect(screen.getByText("new@example.test")).toBeTruthy()
    expect(field("message").value).toBe("My draft")
    await userEvent.click(screen.getByRole("button", { name: "Switch language" }))
    expect(field("message").value).toBe("My draft")
  })

  it("clears personal fields across account changes and sign-out", async () => {
    const view = show()
    await userEvent.type(screen.getByRole("textbox", { name: "Full Name" }), "Private name")
    await userEvent.type(screen.getByRole("textbox", { name: "Message" }), "Private draft")
    mocks.user = { id: "b", email: "b@example.test" }
    view.rerender(<ContactPage />)
    expect(field("name").value).toBe("")
    expect(field("message").value).toBe("")
    expect(screen.getByText("b@example.test")).toBeTruthy()
    mocks.user = null
    view.rerender(<ContactPage />)
    expect(field("email").value).toBe("")
    expect(field("email").readOnly).toBe(false)
  })

  it("retains an editable guest address on an ordinary rerender", async () => {
    mocks.user = null
    const view = show()
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "guest@example.test")
    view.rerender(<ContactPage />)
    expect(field("email").value).toBe("guest@example.test")
    expect(field("email").readOnly).toBe(false)
  })

  it("validates and submits the current derived email", async () => {
    show()
    fireEvent.change(field("name"), { target: { value: "Synthetic resident" } })
    fireEvent.change(field("room"), { target: { value: "Test room" } })
    fireEvent.change(field("issue"), { target: { value: "inquiry" } })
    fireEvent.change(field("message"), { target: { value: "Synthetic request" } })
    await userEvent.click(screen.getByRole("button", { name: "Submit" }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      email: "a@example.test",
      message: "Synthetic request",
    })
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).not.toHaveProperty("turnstileToken")
    expect(screen.getByText("Thank you for reaching out!")).toBeTruthy()
  })
})
