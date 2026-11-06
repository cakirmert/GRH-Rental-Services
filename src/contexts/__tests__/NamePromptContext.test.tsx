import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NamePromptProvider, useNamePrompt } from "../NamePromptContext"

const account = vi.hoisted(() => ({ id: "account-a", name: "Resident", status: "authenticated" }))
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: account.id, name: account.name, role: "USER" } },
    status: account.status,
  }),
}))
vi.mock("@/components/NamePrompt", () => ({
  default: ({
    open,
    focusSection,
    onOpenChange,
  }: {
    open: boolean
    focusSection?: string
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div role="dialog">
        <span>{focusSection ?? "general"}</span>
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}))
function Trigger() {
  const { openPrompt } = useNamePrompt()
  return <button onClick={() => openPrompt({ focusSection: "passkeys" })}>Settings</button>
}
const tree = (
  <NamePromptProvider>
    <Trigger />
  </NamePromptProvider>
)
beforeEach(() =>
  Object.assign(account, { id: "account-a", name: "Resident", status: "authenticated" }),
)
afterEach(cleanup)

describe("name prompt policy", () => {
  it("opens automatically for a missing name, then closes when the name is supplied", () => {
    account.name = ""
    const { rerender } = render(tree)
    expect(screen.getByRole("dialog").textContent).toContain("profile")
    fireEvent.click(screen.getByText("Close"))
    expect(screen.getByRole("dialog")).toBeDefined()
    account.name = "Completed profile"
    rerender(
      <NamePromptProvider>
        <Trigger />
      </NamePromptProvider>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("preserves explicit manual focus until closed", () => {
    render(tree)
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByText("Settings"))
    expect(screen.getByRole("dialog").textContent).toContain("passkeys")
    fireEvent.click(screen.getByText("Close"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("drops manual-open state across account and loading transitions", () => {
    const { rerender } = render(tree)
    fireEvent.click(screen.getByText("Settings"))
    account.id = "account-b"
    rerender(
      <NamePromptProvider>
        <Trigger />
      </NamePromptProvider>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByText("Settings"))
    account.status = "loading"
    rerender(
      <NamePromptProvider>
        <Trigger />
      </NamePromptProvider>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    account.status = "authenticated"
    rerender(
      <NamePromptProvider>
        <Trigger />
      </NamePromptProvider>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
