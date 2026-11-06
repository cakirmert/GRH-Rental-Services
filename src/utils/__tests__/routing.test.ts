import { describe, it, expect } from "vitest"
import { routeToPath, pathToRoute, type AppRoute } from "../routing"

const routes: [AppRoute, string][] = [
  [{ view: "list" }, "/"],
  [{ view: "booking", itemId: "item-123" }, "/items/item-123"],
  [{ view: "my-bookings" }, "/bookings"],
  [{ view: "my-bookings", highlightId: "booking-456" }, "/bookings/booking-456"],
  [{ view: "rental-dashboard" }, "/staff"],
  [{ view: "admin-dashboard" }, "/admin"],
  ...(["about", "contact", "developers", "faq", "imprint", "privacy"] as const).map(
    (view) => [{ view }, "/" + view] as [AppRoute, string],
  ),
]

describe("canonical V2 routing", () => {
  it.each(routes)("round trips %j through %s", (route, path) => {
    expect(routeToPath(route)).toBe(path)
    expect(pathToRoute(path)).toEqual(route)
  })

  it.each(["with spaces", "slash/inside", "question?mark&hash#", "ümlaut"])(
    "keeps the identifier %s in a single path segment",
    (id) => {
      for (const route of [
        { view: "booking", itemId: id },
        { view: "my-bookings", highlightId: id },
      ] as AppRoute[]) {
        const url = new URL(routeToPath(route), "https://example.test")
        expect(url.search).toBe("")
        expect(url.hash).toBe("")
        expect(pathToRoute(url.pathname)).toEqual(route)
      }
    },
  )

  it.each(["book=item-123", "bookings&highlight=id", "rental", "admin", "contact"])(
    "does not interpret old view parameters: %s",
    (query) => {
      expect(pathToRoute("/", new URLSearchParams(query))).toEqual({ view: "list" })
    },
  )

  it("recognizes staff and administration subpages", () => {
    expect(pathToRoute("/staff/calendar")).toEqual({ view: "rental-dashboard" })
    expect(pathToRoute("/admin/inactive/user-1")).toEqual({ view: "admin-dashboard" })
  })

  it("handles malformed encoded identifiers without throwing", () => {
    expect(pathToRoute("/items/%E0%A4%A")).toEqual({ view: "list" })
    expect(pathToRoute("/bookings/%E0%A4%A")).toEqual({ view: "my-bookings" })
  })
})
