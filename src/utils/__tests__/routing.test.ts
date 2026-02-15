import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { routeToPath, pathToRoute, navigateToRoute, getCurrentRoute } from "../routing"
import type { AppRoute } from "@/types/routing"

describe("routing utils", () => {
  describe("routeToPath", () => {
    it("returns correct path for list view", () => {
      expect(routeToPath({ view: "list" })).toBe("/")
    })

    it("returns correct path for booking view", () => {
      expect(routeToPath({ view: "booking", itemId: "123" })).toBe("/?book=123")
    })

    it("returns correct path for my-bookings view without highlight", () => {
      expect(routeToPath({ view: "my-bookings" })).toBe("/?bookings")
    })

    it("returns correct path for my-bookings view with highlight", () => {
      expect(routeToPath({ view: "my-bookings", highlightId: "456" })).toBe("/?bookings&highlight=456")
    })

    it("returns correct path for rental-dashboard", () => {
      expect(routeToPath({ view: "rental-dashboard" })).toBe("/?rental")
    })

    it("returns correct path for admin-dashboard", () => {
      expect(routeToPath({ view: "admin-dashboard" })).toBe("/?admin")
    })

    it("returns correct path for about", () => {
      expect(routeToPath({ view: "about" })).toBe("/?about")
    })

    it("returns correct path for contact", () => {
      expect(routeToPath({ view: "contact" })).toBe("/?contact")
    })

    it("returns correct path for developers", () => {
      expect(routeToPath({ view: "developers" })).toBe("/?developers")
    })

    it("returns correct path for faq", () => {
      expect(routeToPath({ view: "faq" })).toBe("/?faq")
    })

    it("returns correct path for imprint", () => {
      expect(routeToPath({ view: "imprint" })).toBe("/?imprint")
    })

    it("returns correct path for privacy", () => {
      expect(routeToPath({ view: "privacy" })).toBe("/?privacy")
    })
  })

  describe("pathToRoute", () => {
    it("parses booking route correctly", () => {
      const searchParams = new URLSearchParams("?book=123")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "booking", itemId: "123" })
    })

    it("parses my-bookings route correctly", () => {
      const searchParams = new URLSearchParams("?bookings")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "my-bookings", highlightId: undefined })
    })

    it("parses my-bookings route with highlight correctly", () => {
      const searchParams = new URLSearchParams("?bookings&highlight=456")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "my-bookings", highlightId: "456" })
    })

    it("parses rental-dashboard route correctly", () => {
      const searchParams = new URLSearchParams("?rental")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "rental-dashboard" })
    })

    it("parses admin-dashboard route correctly", () => {
      const searchParams = new URLSearchParams("?admin")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "admin-dashboard" })
    })

    it("parses about route correctly", () => {
      const searchParams = new URLSearchParams("?about")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "about" })
    })

    it("parses contact route correctly", () => {
      const searchParams = new URLSearchParams("?contact")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "contact" })
    })

    it("parses developers route correctly", () => {
      const searchParams = new URLSearchParams("?developers")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "developers" })
    })

    it("parses faq route correctly", () => {
      const searchParams = new URLSearchParams("?faq")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "faq" })
    })

    it("parses imprint route correctly", () => {
      const searchParams = new URLSearchParams("?imprint")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "imprint" })
    })

    it("parses privacy route correctly", () => {
      const searchParams = new URLSearchParams("?privacy")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "privacy" })
    })

    it("defaults to list view for unknown parameters", () => {
      const searchParams = new URLSearchParams("")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "list" })
    })

    it("defaults to list view for unrelated parameters", () => {
      const searchParams = new URLSearchParams("?foo=bar")
      expect(pathToRoute("/", searchParams)).toEqual({ view: "list" })
    })
  })

  describe("navigateToRoute", () => {
    let pushStateSpy: any
    let replaceStateSpy: any

    beforeEach(() => {
      pushStateSpy = vi.spyOn(window.history, "pushState").mockImplementation(() => {})
      replaceStateSpy = vi.spyOn(window.history, "replaceState").mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it("calls pushState with correct path", () => {
      const route: AppRoute = { view: "booking", itemId: "123" }
      navigateToRoute(route)
      expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/?book=123")
    })

    it("calls replaceState when replace is true", () => {
      const route: AppRoute = { view: "about" }
      navigateToRoute(route, true)
      expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/?about")
    })
  })

  describe("getCurrentRoute", () => {
    const originalLocation = window.location

    beforeEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        enumerable: true,
        value: {
          href: "http://localhost/",
        },
      })
    })

    afterEach(() => {
      Object.defineProperty(window, "location", {
        configurable: true,
        enumerable: true,
        value: originalLocation,
      })
    })

    it("returns list view for root path", () => {
      window.location.href = "http://localhost/"
      expect(getCurrentRoute()).toEqual({ view: "list" })
    })

    it("returns booking view when book param is present", () => {
      window.location.href = "http://localhost/?book=123"
      expect(getCurrentRoute()).toEqual({ view: "booking", itemId: "123" })
    })
  })
})
