// @vitest-environment node
import { describe, expect, it } from "vitest"
import { BookingStatus } from "@prisma/client"
import {
  assertUserNotesDoNotUseAdminBlockPrefix,
  bookingWindow,
  canManageScopedBooking,
  canTeamTransitionStatus,
} from "../bookings/policies"
import { OperationError } from "../shared/operation"

describe("reusable booking policy", () => {
  it("counts Berlin civil days across DST independently of device timezone", () => {
    const previousZone = process.env.TZ
    process.env.TZ = "America/New_York"
    try {
      const actor = { id: "resident", role: "USER" }
      const now = new Date("2027-03-01T00:00:00Z")
      // Less than24 elapsed hours, but crosses two Berlin date boundaries.
      expect(() =>
        bookingWindow(
          actor,
          {
            start: "2027-03-27T23:30:00+01:00",
            end: "2027-03-29T00:15:00+02:00",
          },
          "create",
          now,
        ),
      ).toThrow("Booking range cannot exceed 2 days.")
      const spring = bookingWindow(
        actor,
        {
          start: "2027-03-27T12:00:00+01:00",
          end: "2027-03-28T12:00:00+02:00",
        },
        "update",
        now,
      )
      expect(spring.endDate.getTime() - spring.startDate.getTime()).toBe(23 * 3600000)
      const autumn = bookingWindow(
        actor,
        {
          start: "2027-10-30T12:00:00+02:00",
          end: "2027-10-31T12:00:00+01:00",
        },
        "create",
        now,
      )
      expect(autumn.endDate.getTime() - autumn.startDate.getTime()).toBe(25 * 3600000)
    } finally {
      if (previousZone === undefined) delete process.env.TZ
      else process.env.TZ = previousZone
    }
  })

  it("shares range and past-time validation across creation and rescheduling", () => {
    const actor = { id: "staff", role: "RENTAL" }
    const now = new Date("2027-01-01T00:00:00Z")
    for (const action of ["create", "update"] as const) {
      expect(() => bookingWindow(actor, { start: "invalid", end: "invalid" }, action, now)).toThrow(
        OperationError,
      )
      expect(() =>
        bookingWindow(
          actor,
          { start: "2027-01-02T12:00:00Z", end: "2027-01-16T12:00:00Z" },
          action,
          now,
        ),
      ).toThrow("Booking range cannot exceed 14 days.")
    }
    expect(() =>
      bookingWindow(
        actor,
        { start: "2026-12-31T12:00:00Z", end: "2027-01-01T12:00:00Z" },
        "update",
        now,
      ),
    ).toThrow("Cannot update booking to a time in the past.")
  })

  it("requires assigned/responsible staff authority rather than booking ownership", () => {
    const booking = {
      assignedToId: "assigned",
      item: { responsibleMembers: [{ id: "responsible" }] },
    }
    expect(canManageScopedBooking({ id: "other", role: "ADMIN" }, booking)).toBe(true)
    expect(canManageScopedBooking({ id: "assigned", role: "RENTAL" }, booking)).toBe(true)
    expect(canManageScopedBooking({ id: "responsible", role: "RENTAL" }, booking)).toBe(true)
    expect(canManageScopedBooking({ id: "other", role: "RENTAL" }, booking)).toBe(false)
    expect(canManageScopedBooking({ id: "assigned", role: "USER" }, booking)).toBe(false)
  })

  it("keeps explicit handover/return transitions and the four-hour handover window", () => {
    const now = new Date("2027-01-01T12:00:00Z")
    expect(
      canTeamTransitionStatus(BookingStatus.REQUESTED, BookingStatus.COMPLETED, now, now),
    ).toBe(false)
    expect(canTeamTransitionStatus(BookingStatus.REQUESTED, BookingStatus.ACCEPTED, now, now)).toBe(
      true,
    )
    expect(
      canTeamTransitionStatus(
        BookingStatus.ACCEPTED,
        BookingStatus.BORROWED,
        new Date(now.getTime() + 4 * 3600000),
        now,
      ),
    ).toBe(true)
    expect(
      canTeamTransitionStatus(
        BookingStatus.ACCEPTED,
        BookingStatus.BORROWED,
        new Date(now.getTime() + 4 * 3600000 + 1),
        now,
      ),
    ).toBe(false)
    expect(
      canTeamTransitionStatus(
        BookingStatus.BORROWED,
        BookingStatus.COMPLETED,
        new Date(now.getTime() + 1),
        now,
      ),
    ).toBe(false)
    expect(canTeamTransitionStatus(BookingStatus.BORROWED, BookingStatus.COMPLETED, now, now)).toBe(
      true,
    )
    expect(
      canTeamTransitionStatus(BookingStatus.COMPLETED, BookingStatus.CANCELLED, now, now),
    ).toBe(false)
  })

  it("keeps user notes outside the staff-note namespace", () => {
    expect(() => assertUserNotesDoNotUseAdminBlockPrefix("A normal booking request")).not.toThrow()
    expect(() =>
      assertUserNotesDoNotUseAdminBlockPrefix("Request\nRental Team (2027-01-01): secret"),
    ).toThrow(OperationError)
  })
})
