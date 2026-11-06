import { StrictMode, type ReactNode } from "react"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IdentitySession, IdentityStatus } from "@/features/identity/types"
import { useCurrentAccount } from "@/features/identity/client"
import { useI18n } from "@/locales/i18n"
import Providers from "../providers"

const mocks = vi.hoisted(() => ({
  session: null as IdentitySession | null,
  status: "unauthenticated" as IdentityStatus,
  provider: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: mocks.session, status: mocks.status, update: vi.fn() }),
  SessionProvider: ({
    children,
    session,
  }: {
    children: ReactNode
    session?: IdentitySession | null
  }) => {
    mocks.provider(session)
    return children
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/components/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock("@/contexts/AuthModalContext", () => ({
  AuthModalProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="auth-modal-provider">{children}</div>
  ),
}))
vi.mock("@/contexts/NamePromptContext", () => ({
  NamePromptProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="name-prompt-provider">{children}</div>
  ),
}))
vi.mock("@/components/ui/toaster", () => ({ Toaster: () => null }))

const key = ["same-private-key"]
const snapshots: Array<{ client: QueryClient; data: string | undefined; status: IdentityStatus }> =
  []
function CacheProbe({ queryFn }: { queryFn?: () => Promise<string> }) {
  const client = useQueryClient()
  const { status } = useCurrentAccount()
  const { locale } = useI18n()
  const { data } = useQuery<string>({
    queryKey: key,
    queryFn: queryFn ?? (() => Promise.resolve("unused")),
    enabled: Boolean(queryFn) && status === "authenticated",
    retry: false,
  })
  // Capture every render, including the first after a changed identity.
  snapshots.push({ client, data, status })
  return (
    <p data-testid="cache-result">
      {locale}:{status}:{data ?? "empty"}
    </p>
  )
}
function account(id = "account-a", role = "USER", isSuperAdmin = false): IdentitySession {
  return {
    user: { id, role, isSuperAdmin, name: "Synthetic", email: "synthetic@example.test" },
    expires: "2027-01-01T00:00:00Z",
  }
}
function currentClient() {
  return snapshots[snapshots.length - 1].client
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  snapshots.length = 0
  mocks.session = account()
  mocks.status = "authenticated"
})
afterEach(() => {
  cleanup()
  for (const { client } of snapshots) client.clear()
})

describe("identity-scoped query providers", () => {
  it("never renders an account's cached private result under another account", async () => {
    const { rerender } = render(
      <Providers initialLocale="de">
        <CacheProbe />
      </Providers>,
    )
    const previous = currentClient()
    await act(async () => {
      previous.setQueryData(key, "private-a")
    })
    await waitFor(() =>
      expect(screen.getByTestId("cache-result").textContent).toContain("private-a"),
    )
    snapshots.length = 0
    mocks.session = account("account-b")
    rerender(
      <Providers initialLocale="de">
        <CacheProbe />
      </Providers>,
    )
    expect(currentClient()).not.toBe(previous)
    expect(snapshots.every(({ data }) => data === undefined)).toBe(true)
    expect(screen.getByTestId("cache-result").textContent).toBe("de:authenticated:empty")
    expect(previous.getQueryCache().getAll()).toHaveLength(0)
  })

  it.each([
    ["RENTAL", false, "USER", false],
    ["ADMIN", true, "ADMIN", false],
    ["USER", false, "ADMIN", true],
  ])("replaces the cache for %s/%s → %s/%s", async (oldRole, oldSuper, role, isSuperAdmin) => {
    mocks.session = account("same-account", oldRole, oldSuper)
    const { rerender } = render(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    const previous = currentClient()
    await act(async () => {
      previous.setQueryData(key, "previous-privileges")
    })
    snapshots.length = 0
    mocks.session = account("same-account", role, isSuperAdmin)
    rerender(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    expect(currentClient()).not.toBe(previous)
    expect(snapshots.every(({ data }) => data === undefined)).toBe(true)
  })

  it("drops private results during loading even if the session provider retains the old account", async () => {
    const { rerender } = render(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    const authenticated = currentClient()
    await act(async () => {
      authenticated.setQueryData(key, "private-a")
    })
    snapshots.length = 0
    mocks.status = "loading"
    rerender(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    const loading = currentClient()
    expect(loading).not.toBe(authenticated)
    expect(snapshots.every(({ data }) => data === undefined)).toBe(true)
    expect(screen.getByTestId("cache-result").textContent).toBe("en:loading:empty")
    mocks.status = "authenticated"
    rerender(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    expect(currentClient()).not.toBe(loading)
    expect(currentClient()).not.toBe(authenticated)
    expect(currentClient().getQueryData(key)).toBeUndefined()
  })

  it("does not resurrect a signed-out account's cache on a later sign-in", async () => {
    const { rerender } = render(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    const previous = currentClient()
    await act(async () => {
      previous.setQueryData(key, "private-a")
    })
    mocks.status = "unauthenticated"
    mocks.session = null
    rerender(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    expect(screen.getByTestId("cache-result").textContent).toBe("en:unauthenticated:empty")
    mocks.session = account()
    mocks.status = "authenticated"
    rerender(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    expect(currentClient()).not.toBe(previous)
    expect(currentClient().getQueryData(key)).toBeUndefined()
  })

  it("ignores an old query's late response after an account switch", async () => {
    const oldRequest = deferred<string>()
    const newRequest = deferred<string>()
    const { rerender } = render(
      <Providers>
        <CacheProbe queryFn={() => oldRequest.promise} />
      </Providers>,
    )
    const previous = currentClient()
    mocks.session = account("account-b")
    rerender(
      <Providers>
        <CacheProbe queryFn={() => newRequest.promise} />
      </Providers>,
    )
    const next = currentClient()
    await act(async () => {
      oldRequest.resolve("late-private-a")
    })
    expect(next.getQueryData(key)).toBeUndefined()
    expect(screen.getByTestId("cache-result").textContent).not.toContain("late-private-a")
    expect(previous.getQueryCache().getAll()).toHaveLength(0)
    await act(async () => {
      newRequest.resolve("private-b")
    })
    await waitFor(() =>
      expect(screen.getByTestId("cache-result").textContent).toBe("en:authenticated:private-b"),
    )
  })

  it("keeps the cache for a profile snapshot change without a verification transition", async () => {
    const { rerender } = render(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    const previous = currentClient()
    await act(async () => {
      previous.setQueryData(key, "private-a")
    })
    mocks.session = { ...account(), user: { ...account().user, name: "Updated name" } }
    rerender(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    expect(currentClient()).toBe(previous)
    expect(screen.getByTestId("cache-result").textContent).toContain("private-a")
  })

  it("keeps public server-rendered content, supplied locale, and account dialogs available while loading", () => {
    mocks.status = "loading"
    mocks.session = null
    const html = renderToString(
      <Providers initialLocale="de">
        <CacheProbe />
        <h1>Public catalogue</h1>
      </Providers>,
    )
    expect(html).toContain("Public catalogue")
    expect(html).toContain("de")
    expect(html).toContain("loading")
    expect(html).toContain('data-testid="auth-modal-provider"')
    expect(html).toContain('data-testid="name-prompt-provider"')
  })

  it("preserves a supplied SSR session through the identity provider", () => {
    const session = account()
    render(
      <Providers session={session} initialLocale="de">
        <CacheProbe />
      </Providers>,
    )
    expect(mocks.provider).toHaveBeenCalledWith(session)
    expect(screen.getByTestId("auth-modal-provider")).toBeDefined()
    expect(screen.getByTestId("name-prompt-provider")).toBeDefined()
  })

  it("can resolve the current query under StrictMode's effect replay", async () => {
    const request = deferred<string>()
    render(
      <StrictMode>
        <Providers>
          <CacheProbe queryFn={() => request.promise} />
        </Providers>
      </StrictMode>,
    )
    await act(async () => {
      request.resolve("current-account")
    })
    await waitFor(() =>
      expect(screen.getByTestId("cache-result").textContent).toContain("current-account"),
    )
  })

  it("refreshes server permissions after account and superadmin changes across loading", () => {
    mocks.session = account("account-a", "ADMIN", true)
    const { rerender } = render(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    expect(mocks.refresh).not.toHaveBeenCalled()
    mocks.status = "loading"
    rerender(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    expect(mocks.refresh).not.toHaveBeenCalled()
    mocks.session = account("account-a", "ADMIN", false)
    mocks.status = "authenticated"
    rerender(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    mocks.session = account("account-b", "ADMIN", false)
    rerender(
      <Providers>
        <CacheProbe />
      </Providers>,
    )
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })
})
