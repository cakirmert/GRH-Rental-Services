import { describe, expect, it } from "vitest"
import { customerNotes, legacyStaffNotes, ownerBooking, peakQuantity } from "../bookingSecurity"

describe("booking security representations", () => {
  it("separates private legacy content without discarding it", () => {
    const note = "Customer event\n\nRental Team (2026-11-05):\nInternal\n\nSystem: more"
    expect(customerNotes(note)).toBe("Customer event")
    expect(legacyStaffNotes(note)).toBe("Rental Team (2026-11-05):\nInternal\n\nSystem: more")
    expect(ownerBooking({ notes: note, staffNotes: "private", id: "one" })).toEqual({
      notes: "Customer event",
      id: "one",
    })
  })
  it("does not add non-overlapping inventory or overlapping endpoints", () => {
    expect(
      peakQuantity([
        { startDate: new Date(0), endDate: new Date(10), quantity: 2 },
        { startDate: new Date(10), endDate: new Date(20), quantity: 3 },
      ]),
    ).toBe(3)
  })
  it("counts simultaneous inventory", () => {
    expect(
      peakQuantity([
        { startDate: new Date(0), endDate: new Date(20), quantity: 2 },
        { startDate: new Date(10), endDate: new Date(30), quantity: 3 },
      ]),
    ).toBe(5)
  })
})
