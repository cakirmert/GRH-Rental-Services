import { describe, expect, it } from "vitest"
import { readBookmark } from "../bookmarks"

describe("saved bookmark entry URLs", () => {
  it.each([
    [{ bookings: "" }, { view: "my-bookings" }],
    [{ rental: "" }, { view: "rental-dashboard" }],
    [{ admin: "" }, { view: "admin-dashboard" }],
    [{ book: "item/with space" }, { view: "booking", itemId: "item/with space" }],
    [{ highlight: "booking-1" }, { view: "my-bookings", highlightId: "booking-1" }],
    [
      { bookings: "", highlight: "booking-1" },
      { view: "my-bookings", highlightId: "booking-1" },
    ],
    [{ chat: "booking-1" }, { view: "chat", bookingId: "booking-1" }],
  ])("reads %j without navigation", (parameters, expected) => {
    expect(readBookmark(parameters)).toEqual(expected)
  })
  it.each(["about", "contact", "developers", "faq", "imprint", "privacy"])(
    "opens the saved %s view",
    (view) => {
      expect(readBookmark({ [view]: "" })).toEqual({ view })
    },
  )
  it("ignores unknown, empty and repeated identifiers", () => {
    expect(readBookmark({ utm_source: "newsletter" })).toBeNull()
    expect(readBookmark({ book: "" })).toBeNull()
    expect(readBookmark({ book: ["one", "two"] })).toBeNull()
  })
})
