import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ReleaseFeedbackDialog from "../ReleaseFeedbackDialog"
import { RELEASE_ID } from "@/constants/release"

type FeedbackInput = {
  releaseId: string
  interfaceMode: string
  sentiment: string
  message: string
}
const { account, save, setMode, close, invalidate } = vi.hoisted(() => ({
  account: { id: "staff-a", role: "RENTAL" },
  save: vi.fn<(input: FeedbackInput) => Promise<unknown>>(),
  setMode: vi.fn(),
  close: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: account }, status: "authenticated" }),
}))
vi.mock("@/contexts/ReleaseContext", () => ({ useRelease: () => ({ mode: "preview", setMode }) }))
vi.mock("@/locales/i18n", () => ({ useI18n: () => ({ locale: "en" }) }))
vi.mock("@/utils/trpc", async () => {
  const { useMutation } = await import("@tanstack/react-query")
  return {
    trpc: {
      releaseFeedback: {
        submit: { useMutation: () => useMutation({ mutationFn: save, retry: false }) },
      },
      useUtils: () => ({ releaseFeedback: { getMine: { invalidate }, summary: { invalidate } } }),
    },
  }
})

let client: QueryClient
function dialog() {
  return (
    <QueryClientProvider client={client}>
      <ReleaseFeedbackDialog mode="classic" onClose={close} />
    </QueryClientProvider>
  )
}
beforeEach(() => {
  account.id = "staff-a"
  account.role = "RENTAL"
  save.mockReset()
  setMode.mockReset()
  close.mockReset()
  invalidate.mockReset()
  localStorage.clear()
  client = new QueryClient()
})
afterEach(() => {
  cleanup()
  client.clear()
})

describe("return to classic calendar", () => {
  it("requires a nonblank reason before saving or switching", () => {
    render(dialog())
    const reason = screen.getByRole("textbox")
    const submit = screen.getByRole("button", {
      name: "Save reason and use classic",
    }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(reason, { target: { value: "   " } })
    fireEvent.submit(reason.closest("form")!)
    expect(submit.disabled).toBe(true)
    expect(save).not.toHaveBeenCalled()
    expect(setMode).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Use classic without saving" })).toBeNull()
  })

  it("saves the reason using the existing contract and switches only after success", async () => {
    let resolve!: (value: unknown) => void
    save.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    render(dialog())
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  I need a denser month view.  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save reason and use classic" }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        {
          releaseId: RELEASE_ID,
          interfaceMode: "classic",
          sentiment: "mixed",
          message: "I need a denser month view.",
        },
        expect.anything(),
      ),
    )
    expect(setMode).not.toHaveBeenCalled()
    await act(async () => {
      resolve({})
    })
    await waitFor(() => expect(setMode).toHaveBeenCalledWith("classic"))
    expect(close).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledWith({ releaseId: RELEASE_ID, userId: "staff-a" })
  })

  it("keeps the reason visible after failure and provides an explicit unsaved escape", async () => {
    save.mockRejectedValue(new Error("Offline"))
    render(dialog())
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The timetable does not load." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save reason and use classic" }))
    expect((await screen.findByRole("alert")).textContent).toContain("Feedback not saved")
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "The timetable does not load.",
    )
    expect(localStorage.length).toBe(0)
    expect(setMode).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Use classic without saving" }))
    expect(setMode).toHaveBeenCalledWith("classic")
    expect(close).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it("clears a private draft on account change and ignores the old account's pending save", async () => {
    let resolve!: (value: unknown) => void
    save.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const view = render(dialog())
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Account A private reason" } })
    fireEvent.click(screen.getByRole("button", { name: "Save reason and use classic" }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    account.id = "staff-b"
    view.rerender(dialog())
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("")
    await act(async () => {
      resolve({})
    })
    expect(setMode).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
  })

  it("hides the reason immediately if staff access is removed", () => {
    const view = render(dialog())
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Staff-only draft" } })
    account.role = "USER"
    view.rerender(dialog())
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByDisplayValue("Staff-only draft")).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })
})
