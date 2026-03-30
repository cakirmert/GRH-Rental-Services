import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ThemeProvider } from "../theme-provider"
import * as React from "react"

// Mock next-themes
vi.mock("next-themes", () => ({
  ThemeProvider: vi.fn(({ children, ...props }) => (
    <div data-testid="next-themes-provider" {...props}>
      {children}
    </div>
  )),
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
      </ThemeProvider>
    )

    expect(screen.getByTestId("child")).toBeTruthy()
    expect(screen.getByText("Child Content")).toBeTruthy()
  })

  it("passes default props to NextThemesProvider", () => {
    render(
      <ThemeProvider>
        <div>Content</div>
      </ThemeProvider>
    )

    expect(NextThemesProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        attribute: "class",
        defaultTheme: "system",
        enableSystem: true,
        disableTransitionOnChange: true,
        storageKey: "grh-booking-theme",
      }),
      expect.anything()
    )
  })

  it("forwards additional props to NextThemesProvider", () => {
    render(
      <ThemeProvider forcedTheme="dark">
        <div>Content</div>
      </ThemeProvider>
    )

    expect(NextThemesProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        forcedTheme: "dark",
      }),
      expect.anything()
    )
  })

  it("initially renders children hidden and then visible after mount", () => {
    const { container } = render(
      <ThemeProvider>
        <div data-testid="child">Content</div>
      </ThemeProvider>
    )

    // After mount (standard render behavior), it should NOT be wrapped in the visibility: hidden div
    const child = screen.getByTestId("child")
    // The component logic is: {mounted ? children : <div style={{ visibility: "hidden" }}>{children}</div>}
    // After mount, child.parentElement should be the mocked NextThemesProvider div
    expect(child.parentElement?.getAttribute('data-testid')).toBe("next-themes-provider")
    expect(child.parentElement?.style.visibility).not.toBe("hidden")
  })

  it("demonstrates the hydration fix by checking the render output when not mounted", () => {
    // To test the 'mounted' state, we can mock useEffect to be a no-op temporarily
    const useEffectSpy = vi.spyOn(React, 'useEffect').mockImplementation(() => {})

    render(
      <ThemeProvider>
        <div data-testid="child">Content</div>
      </ThemeProvider>
    )

    // In this "unmounted" state (useEffect didn't run), it should be hidden
    const child = screen.getByTestId("child")
    // child -> div (visibility: hidden) -> next-themes-provider
    expect(child.parentElement?.style.visibility).toBe("hidden")

    useEffectSpy.mockRestore()
  })
})
