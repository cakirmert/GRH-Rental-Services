import { act, cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ProfilesTab from "../ProfilesTab"
import { I18nProvider } from "@/locales/i18n"
import { TooltipProvider } from "@/components/ui/tooltip"

const mocks = vi.hoisted(() => ({
  members: [] as { id: string; name: string; email: string }[],
  save: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock("@/utils/trpc", () => ({
  trpc: {
    useContext: () => ({ admin: { itemsDefaults: { list: { invalidate: mocks.invalidate } } } }),
    admin: {
      rentalTeamMembers: { list: { useQuery: () => ({ data: mocks.members, isLoading: false }) } },
      itemsDefaults: {
        list: {
          useQuery: () => ({
            data: [
              {
                id: "bar",
                titleEn: "Bar",
                titleDe: "Barraum",
                type: "ROOM",
                responsibleMembers: [],
              },
            ],
            isLoading: false,
          }),
        },
        update: {
          useMutation: () => ({ reset: vi.fn(), mutateAsync: mocks.save, isPending: false }),
        },
      },
    },
  },
}))
vi.mock("@/components/ui/use-toast", () => ({ toast: vi.fn() }))

const members = [
  { id: "a", name: "Member A", email: "a@example.test" },
  { id: "b", name: "Member B", email: "b@example.test" },
]
function show() {
  return render(<ProfilesTab />, {
    wrapper: ({ children }) => (
      <I18nProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </I18nProvider>
    ),
  })
}
function assignment(member: string) {
  return screen.getByRole("checkbox", { name: `Assign Bar to Member ${member}` })
}
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.members = [...members]
  mocks.save.mockResolvedValue({})
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("member assignment drafts", () => {
  it("derives the first available member when members arrive", () => {
    mocks.members = []
    const view = show()
    expect(screen.getByText("Select a team member")).toBeTruthy()
    mocks.members = [...members]
    view.rerender(<ProfilesTab />)
    expect(
      screen.getByRole("button", { name: /Member A a@example.test/ }).getAttribute("aria-pressed"),
    ).toBe("true")
    expect(assignment("A").getAttribute("aria-checked")).toBe("false")
  })

  it("resets assignments on member changes while retaining both search filters", async () => {
    show()
    await userEvent.type(screen.getByRole("textbox", { name: "Search members..." }), "Member")
    await userEvent.type(screen.getByRole("textbox", { name: "Search across all items..." }), "Bar")
    await userEvent.click(assignment("A"))
    expect(assignment("A").getAttribute("aria-checked")).toBe("true")
    await userEvent.click(screen.getByRole("button", { name: /Member B b@example.test/ }))
    expect(assignment("B").getAttribute("aria-checked")).toBe("false")
    expect(
      (screen.getByRole("button", { name: "Save Changes (0)" }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole("textbox", { name: "Search members..." }) as HTMLInputElement).value,
    ).toBe("Member")
    expect(
      (screen.getByRole("textbox", { name: "Search across all items..." }) as HTMLInputElement)
        .value,
    ).toBe("Bar")
    await userEvent.click(screen.getByRole("button", { name: /Member A a@example.test/ }))
    expect(assignment("A").getAttribute("aria-checked")).toBe("false")
  })

  it("does not resurrect a removed member's abandoned draft", async () => {
    const view = show()
    await userEvent.click(assignment("A"))
    mocks.members = [members[1]]
    view.rerender(<ProfilesTab />)
    expect(assignment("B").getAttribute("aria-checked")).toBe("false")
    mocks.members = [...members]
    view.rerender(<ProfilesTab />)
    expect(assignment("A").getAttribute("aria-checked")).toBe("false")
  })

  it("keeps a new member's draft when an earlier member's save completes", async () => {
    let finish!: (value: object) => void
    mocks.save.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    show()
    await userEvent.click(assignment("A"))
    await userEvent.click(screen.getByRole("button", { name: "Save Changes (1)" }))
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ itemId: "bar", memberIds: ["a"] })
    await userEvent.click(screen.getByRole("button", { name: /Member B b@example.test/ }))
    await userEvent.click(assignment("B"))
    await act(async () => {
      finish({})
    })
    expect(assignment("B").getAttribute("aria-checked")).toBe("true")
    expect(
      (screen.getByRole("button", { name: "Save Changes (1)" }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})
