import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ThemeProvider } from "../theme-provider"
import { renderToString } from "react-dom/server"

// Mock next-themes
vi.mock("next-themes", () => ({
  ThemeProvider: vi.fn(({ children }) => <div data-testid="next-themes-provider">{children}</div>),
}))

import { ThemeProvider as NextThemesProvider } from "next-themes"

describe("ThemeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders children", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Child Content</div>
      </ThemeProvider>,
    )

    expect(screen.getByTestId("child")).toBeTruthy()
    expect(screen.getByText("Child Content")).toBeTruthy()
  })

  it("passes default props to NextThemesProvider", () => {
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>,
    )

    expect(NextThemesProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        attribute: "class",
        defaultTheme: "system",
        enableSystem: true,
        disableTransitionOnChange: true,
        storageKey: "grh-booking-theme",
      }),
      undefined,
    )
  })

  it("forwards additional props to NextThemesProvider", () => {
    render(
      <ThemeProvider forcedTheme="dark">
        <div>Content</div>
      </ThemeProvider>,
    )

    expect(NextThemesProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        forcedTheme: "dark",
      }),
      undefined,
    )
  })

  it("keeps children directly under the theme provider", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Content</div>
      </ThemeProvider>,
    )

    const child = screen.getByTestId("child")
    expect(child.parentElement?.getAttribute("data-testid")).toBe("next-themes-provider")
    expect(child.parentElement?.style.visibility).not.toBe("hidden")
  })

  it("serves visible content before JavaScript runs", () => {
    const html = renderToString(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>,
    )

    expect(html).not.toContain("visibility:hidden")
    expect(html).toContain("Content")
  })
})
