import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RELEASE_ID } from "@/constants/release"
import ReleaseFeedbackDialog from "../ReleaseFeedbackDialog"

type Feedback = { sentiment: "good"; interfaceMode: "classic"; message: string }
type Input = { releaseId: string; userId: string }

const { account, fetchMine, cacheKey } = vi.hoisted(() => ({
  account: { id: "account-a" },
  fetchMine: vi.fn<(input: Input) => Promise<Feedback | null>>(),
  cacheKey: (input: Input) => ["releaseFeedback.getMine", input] as const,
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: account.id, role: "USER" } }, status: "authenticated" }),
}))
vi.mock("@/contexts/AuthModalContext", () => ({ useAuthModal: () => ({ openAuthModal: vi.fn() }) }))
vi.mock("@/contexts/ReleaseContext", () => ({ useRelease: () => ({ mode: "classic" }) }))
vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ locale: "en", t: (key: string) => key }) }))
vi.mock("@/utils/trpc", async () => {
  const { useQuery, useQueryClient } = await import("@tanstack/react-query")
  return {
    trpc: {
      releaseFeedback: {
        getMine: {
          // Only the transport is mocked: input identity, all component query
          // options, observer lifetimes, and cache/refetch state remain real.
          useQuery: (input: Input, options: Record<string, unknown>) =>
            useQuery({
              queryKey: cacheKey(input),
              queryFn: () => fetchMine(input),
              ...options,
            }),
        },
        submit: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }) },
      },
      useUtils: () => {
        const client = useQueryClient()
        return {
          releaseFeedback: {
            getMine: {
              invalidate: (input: Input) => client.invalidateQueries({ queryKey: cacheKey(input) }),
            },
            summary: { invalidate: vi.fn() },
          },
        }
      },
    },
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function feedback(message: string): Feedback {
  return { sentiment: "good", interfaceMode: "classic", message }
}

let client: QueryClient

function dialog() {
  return (
    <QueryClientProvider client={client}>
      <ReleaseFeedbackDialog mode="submit" onClose={vi.fn()} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  account.id = "account-a"
  fetchMine.mockReset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
})
afterEach(() => {
  cleanup()
  client.clear()
})

describe("release feedback cache privacy and draft lifecycle", () => {
  it("never shows the previous account's cached feedback after a live identity change", async () => {
    const first = deferred<Feedback>()
    const second = deferred<Feedback>()
    fetchMine.mockImplementation((input) =>
      input.userId === "account-a" ? first.promise : second.promise,
    )
    const view = render(dialog())
    await act(async () => {
      first.resolve(feedback("Account A private comment"))
    })
    expect(((await screen.findByRole("textbox")) as HTMLTextAreaElement).value).toBe(
      "Account A private comment",
    )

    // Keep the same QueryClient and component observer mounted, as when Auth.js
    // broadcasts an account switch from another browser tab.
    account.id = "account-b"
    view.rerender(dialog())
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByDisplayValue("Account A private comment")).toBeNull()
    await waitFor(() =>
      expect(fetchMine).toHaveBeenCalledWith({ releaseId: RELEASE_ID, userId: "account-b" }),
    )
    await act(async () => {
      second.resolve(feedback("Account B comment"))
    })
    expect(((await screen.findByRole("textbox")) as HTMLTextAreaElement).value).toBe(
      "Account B comment",
    )
    expect(client.getQueryData(cacheKey({ releaseId: RELEASE_ID, userId: "account-a" }))).toEqual(
      feedback("Account A private comment"),
    )
  })

  it("withholds warm cached text until the opening refetch returns fresh feedback", async () => {
    client.setQueryData(
      cacheKey({ releaseId: RELEASE_ID, userId: account.id }),
      feedback("Old cached text"),
    )
    const fresh = deferred<Feedback>()
    fetchMine.mockReturnValue(fresh.promise)
    render(dialog())

    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByRole("status").textContent).toContain("Loading feedback")
    await waitFor(() => expect(fetchMine).toHaveBeenCalledTimes(1))
    await act(async () => {
      fresh.resolve(feedback("Updated in another tab"))
    })
    expect(((await screen.findByRole("textbox")) as HTMLTextAreaElement).value).toBe(
      "Updated in another tab",
    )
  })

  it("preserves an in-progress draft through later refetches and cache updates", async () => {
    fetchMine.mockResolvedValueOnce(feedback("Original saved comment"))
    render(dialog())
    const field = await screen.findByRole("textbox")
    fireEvent.change(field, { target: { value: "My unfinished local draft" } })

    const later = deferred<Feedback>()
    fetchMine.mockReturnValueOnce(later.promise)
    let refetch!: Promise<void>
    act(() => {
      refetch = client.invalidateQueries({
        queryKey: cacheKey({ releaseId: RELEASE_ID, userId: account.id }),
      })
    })
    await waitFor(() => expect(fetchMine).toHaveBeenCalledTimes(2))
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "My unfinished local draft",
    )
    await act(async () => {
      later.resolve(feedback("New server-side text"))
      await refetch
    })
    expect(client.getQueryData(cacheKey({ releaseId: RELEASE_ID, userId: account.id }))).toEqual(
      feedback("New server-side text"),
    )
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "My unfinished local draft",
    )
  })
})
