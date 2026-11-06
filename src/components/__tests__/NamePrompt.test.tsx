import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import NamePrompt from "../NamePrompt"

const mocks = vi.hoisted(() => ({
  session: {
    user: {
      id: "account-a",
      name: "First resident",
      email: "first@example.test",
      role: "RENTAL",
      isSuperAdmin: false,
    },
  },
  status: "authenticated",
  preferences: undefined as { emailBookingNotifications: boolean } | undefined,
  callbacks: {} as Record<string, Record<string, (...args: any[]) => unknown>>,
  mutations: {} as Record<string, ReturnType<typeof vi.fn>>,
  queries: vi.fn(),
  refetch: vi.fn(),
  setData: vi.fn(),
  update: vi.fn(),
  registration: vi.fn(),
  supported: true,
  toast: vi.fn(),
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: mocks.session, status: mocks.status, update: mocks.update }),
  signOut: vi.fn(),
}))
vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/ui/use-toast", () => ({ toast: mocks.toast }))
vi.mock("@simplewebauthn/browser-v14", () => ({ startRegistration: mocks.registration }))
vi.mock("@/lib/webauthnUtils", () => ({ isPasskeySupported: () => mocks.supported }))
vi.mock("@/utils/trpc", () => {
  const endpoint = (path: string) => ({
    useQuery: () => {
      mocks.queries(path)
      return { data: path === "getPreferences" ? mocks.preferences : [], refetch: mocks.refetch }
    },
    useMutation: (callbacks: Record<string, (...args: any[]) => unknown> = {}) => {
      mocks.callbacks[path] = callbacks
      const mutate = (mocks.mutations[path] ??= vi.fn())
      return { mutate, mutateAsync: mutate, isPending: false }
    },
  })
  return {
    trpc: {
      useUtils: () => ({ user: { getPreferences: { setData: mocks.setData } } }),
      user: Object.fromEntries(
        [
          "getPreferences",
          "getPasskeys",
          "updateName",
          "updatePreferences",
          "selfDemote",
          "deletePasskey",
          "deleteAccount",
        ].map((name) => [name, endpoint(name)]),
      ),
      webauthn: { registerOptions: endpoint("registerOptions"), register: endpoint("register") },
    },
  }
})

const onOpenChange = vi.fn()
const prompt = (open = true) => <NamePrompt open={open} onOpenChange={onOpenChange} />

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session = {
    user: {
      id: "account-a",
      name: "First resident",
      email: "first@example.test",
      role: "RENTAL",
      isSuperAdmin: false,
    },
  }
  mocks.status = "authenticated"
  mocks.preferences = undefined
  mocks.callbacks = {}
  mocks.mutations = {}
  mocks.supported = true
  mocks.update.mockResolvedValue(mocks.session)
  mocks.registration.mockResolvedValue({ id: "new-credential" })
  mocks.setData.mockImplementation((_input, data) => {
    mocks.preferences = data
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe("account settings state", () => {
  it("initializes on opening, preserves edits on snapshot refresh, and resets when reopened", () => {
    const { rerender } = render(prompt(false))
    expect(mocks.queries).not.toHaveBeenCalled()
    rerender(prompt())
    const input = screen.getByLabelText("common.name") as HTMLInputElement
    expect(input.value).toBe("First resident")
    fireEvent.change(input, { target: { value: "Unsaved draft" } })
    mocks.session = { user: { ...mocks.session.user, name: "Updated server name" } }
    rerender(prompt())
    expect((screen.getByLabelText("common.name") as HTMLInputElement).value).toBe("Unsaved draft")
    rerender(prompt(false))
    rerender(prompt())
    expect((screen.getByLabelText("common.name") as HTMLInputElement).value).toBe(
      "Updated server name",
    )
  })

  it("never carries a profile draft to another account", () => {
    const { rerender } = render(prompt())
    fireEvent.change(screen.getByLabelText("common.name"), { target: { value: "Private draft A" } })
    mocks.session = {
      user: { ...mocks.session.user, id: "account-b", name: "Resident B", email: "b@example.test" },
    }
    rerender(prompt())
    expect((screen.getByLabelText("common.name") as HTMLInputElement).value).toBe("Resident B")
    expect((screen.getByLabelText("common.email") as HTMLInputElement).value).toBe("b@example.test")
  })

  it.each(["loading", "unauthenticated"])(
    "does not mount private query hooks while %s",
    (status) => {
      mocks.status = status
      render(prompt())
      expect(mocks.queries).not.toHaveBeenCalled()
      expect(screen.queryByRole("dialog")).toBeNull()
    },
  )

  it("saves a trimmed name and refreshes the session", async () => {
    render(prompt())
    fireEvent.change(screen.getByLabelText("common.name"), { target: { value: "  New name  " } })
    fireEvent.click(screen.getByRole("button", { name: "profile.saveButton" }))
    expect(mocks.mutations.updateName).toHaveBeenCalledWith({ name: "New name" })
    await act(async () => {
      await mocks.callbacks.updateName.onSuccess()
    })
    expect(mocks.update).toHaveBeenCalledOnce()
  })

  it("uses loaded preferences and an explicit optimistic draft with rollback", async () => {
    const { rerender } = render(prompt())
    mocks.preferences = { emailBookingNotifications: false }
    rerender(prompt())
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false")
    fireEvent.click(screen.getByRole("switch"))
    expect(mocks.mutations.updatePreferences).toHaveBeenCalledWith({
      emailBookingNotifications: true,
    })
    rerender(prompt())
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true")
    await act(async () => {
      mocks.callbacks.updatePreferences.onError(new Error("Rejected"))
    })
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false")
    fireEvent.click(screen.getByRole("switch"))
    await act(async () => {
      mocks.callbacks.updatePreferences.onSuccess({ emailBookingNotifications: true })
    })
    expect(mocks.setData).toHaveBeenCalledWith(undefined, { emailBookingNotifications: true })
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true")
  })

  it("preserves the options, browser registration, verification, and refresh sequence", async () => {
    render(prompt())
    mocks.mutations.registerOptions.mockResolvedValue({ challenge: "challenge" })
    mocks.mutations.register.mockResolvedValue({ verified: true })
    fireEvent.click(screen.getByRole("button", { name: "security.addPasskey" }))
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledOnce())
    expect(mocks.mutations.registerOptions).toHaveBeenCalledWith({ userId: "account-a" })
    expect(mocks.registration).toHaveBeenCalledWith({ optionsJSON: { challenge: "challenge" } })
    expect(mocks.mutations.register).toHaveBeenCalledWith({ credential: { id: "new-credential" } })
  })

  it("does not continue a pending passkey ceremony after an account switch", async () => {
    let resolveOptions!: (value: object) => void
    const pending = new Promise<object>((resolve) => {
      resolveOptions = resolve
    })
    const { rerender } = render(prompt())
    mocks.mutations.registerOptions.mockReturnValue(pending)
    fireEvent.click(screen.getByRole("button", { name: "security.addPasskey" }))
    mocks.session = { user: { ...mocks.session.user, id: "account-b", name: "Resident B" } }
    rerender(prompt())
    await act(async () => {
      resolveOptions({ challenge: "old-account" })
    })
    expect(mocks.registration).not.toHaveBeenCalled()
    expect(mocks.mutations.register).not.toHaveBeenCalled()
  })

  it("hides browser registration when passkeys are unavailable", () => {
    mocks.supported = false
    render(prompt())
    expect(screen.queryByRole("button", { name: "security.addPasskey" })).toBeNull()
    expect(screen.getByText("security.passkeyNotSupported")).toBeDefined()
  })
})
