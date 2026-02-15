import { describe, it, expect } from "vitest"
import { routeToPath, pathToRoute, type AppRoute } from "../routing"

describe("routing", () => {
  describe("routeToPath", () => {
    it("should return '/' for list view", () => {
      expect(routeToPath({ view: "list" })).toBe("/")
    })

    it("should return '/?book=123' for booking view with itemId '123'", () => {
      expect(routeToPath({ view: "booking", itemId: "123" })).toBe("/?book=123")
    })

    it("should return '/?bookings' for my-bookings view without highlightId", () => {
      expect(routeToPath({ view: "my-bookings" })).toBe("/?bookings")
    })

    it("should return '/?bookings&highlight=456' for my-bookings view with highlightId '456'", () => {
      expect(routeToPath({ view: "my-bookings", highlightId: "456" })).toBe(
        "/?bookings&highlight=456"
      )
    })

    it("should return '/?rental' for rental-dashboard view", () => {
      expect(routeToPath({ view: "rental-dashboard" })).toBe("/?rental")
    })

    it("should return '/?admin' for admin-dashboard view", () => {
      expect(routeToPath({ view: "admin-dashboard" })).toBe("/?admin")
    })

    it("should return '/?about' for about view", () => {
      expect(routeToPath({ view: "about" })).toBe("/?about")
    })

    it("should return '/?contact' for contact view", () => {
      expect(routeToPath({ view: "contact" })).toBe("/?contact")
    })

    it("should return '/?developers' for developers view", () => {
      expect(routeToPath({ view: "developers" })).toBe("/?developers")
    })

    it("should return '/?faq' for faq view", () => {
      expect(routeToPath({ view: "faq" })).toBe("/?faq")
    })

    it("should return '/?imprint' for imprint view", () => {
      expect(routeToPath({ view: "imprint" })).toBe("/?imprint")
    })

    it("should return '/?privacy' for privacy view", () => {
      expect(routeToPath({ view: "privacy" })).toBe("/?privacy")
    })

    it("should encode special characters in itemId", () => {
      expect(routeToPath({ view: "booking", itemId: "foo bar" })).toBe("/?book=foo%20bar")
    })

    it("should encode special characters in highlightId", () => {
      expect(routeToPath({ view: "my-bookings", highlightId: "foo bar" })).toBe(
        "/?bookings&highlight=foo%20bar"
      )
    })
  })

  describe("pathToRoute", () => {
    it("should return list view for empty path and search params", () => {
      expect(pathToRoute("/", new URLSearchParams())).toEqual({ view: "list" })
    })

    it("should return booking view when 'book' param is present", () => {
      const searchParams = new URLSearchParams("book=123")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "booking", itemId: "123" })
    })

    it("should return my-bookings view when 'bookings' param is present", () => {
      const searchParams = new URLSearchParams("bookings")
      expect(pathToRoute("/", searchParams)).toEqual({
        view: "my-bookings",
        highlightId: undefined,
      })
    })

    it("should return my-bookings view with highlightId when 'highlight' param is also present", () => {
      const searchParams = new URLSearchParams("bookings&highlight=456")
      expect(pathToRoute("/", searchParams)).toEqual({
        view: "my-bookings",
        highlightId: "456",
      })
    })

    it("should return rental-dashboard view when 'rental' param is present", () => {
      expect(pathToRoute("/", new URLSearchParams("rental"))).toEqual({
        view: "rental-dashboard",
      })
    })

    it("should return admin-dashboard view when 'admin' param is present", () => {
      expect(pathToRoute("/", new URLSearchParams("admin"))).toEqual({
        view: "admin-dashboard",
      })
    })

    it("should return about view when 'about' param is present", () => {
      expect(pathToRoute("/", new URLSearchParams("about"))).toEqual({ view: "about" })
    })

    it("should return contact view when 'contact' param is present", () => {
      expect(pathToRoute("/", new URLSearchParams("contact"))).toEqual({ view: "contact" })
    })

    it("should return developers view when 'developers' param is present", () => {
      expect(pathToRoute("/", new URLSearchParams("developers"))).toEqual({
        view: "developers",
      })
    })

    it("should return faq view when 'faq' param is present", () => {
      expect(pathToRoute("/", new URLSearchParams("faq"))).toEqual({ view: "faq" })
    })

    it("should return imprint view when 'imprint' param is present", () => {
      expect(pathToRoute("/", new URLSearchParams("imprint"))).toEqual({ view: "imprint" })
    })

    it("should return privacy view when 'privacy' param is present", () => {
      expect(pathToRoute("/", new URLSearchParams("privacy"))).toEqual({ view: "privacy" })
    })

    it("should fallback to list view for unknown params", () => {
      expect(pathToRoute("/", new URLSearchParams("unknown=1"))).toEqual({ view: "list" })
    })

    it("should prioritize booking over other params", () => {
      const searchParams = new URLSearchParams("book=123&bookings")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "booking", itemId: "123" })
    })

    it("should round-trip correctly", () => {
      const routes: AppRoute[] = [
        { view: "list" },
        { view: "booking", itemId: "123" },
        { view: "my-bookings" },
        { view: "my-bookings", highlightId: "456" },
        { view: "rental-dashboard" },
        { view: "admin-dashboard" },
      ]

      routes.forEach((route) => {
        const path = routeToPath(route)
        const url = new URL(`http://localhost${path}`)
        expect(pathToRoute(url.pathname, url.searchParams)).toEqual(route)
      })
    })
  })
})
