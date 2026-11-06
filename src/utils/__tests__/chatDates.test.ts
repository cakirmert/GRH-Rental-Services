// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  formatChatMessageDate,
  formatChatMessageTime,
  parseChatMessageDate,
  shouldShowChatDateDivider,
} from "@/utils/chatDates"

const labels = { today: "Today", yesterday: "Yesterday" }

describe.each(["UTC", "America/New_York", "Asia/Tokyo"])(
  "Berlin chat dates on a %s host",
  (hostZone) => {
    beforeEach(() => vi.stubEnv("TZ", hostZone))
    afterEach(() => vi.unstubAllEnvs())

    it("labels today and yesterday using Berlin midnight", () => {
      const now = new Date("2027-07-01T22:30:00Z")
      expect(formatChatMessageDate("2027-07-01T22:05:00Z", "en-US", labels, now)).toBe("Today")
      expect(formatChatMessageDate("2027-07-01T21:45:00Z", "en-US", labels, now)).toBe("Yesterday")
    })

    it("finds yesterday across both clock changes", () => {
      expect(
        formatChatMessageDate(
          "2027-03-28T00:15:00Z",
          "en-US",
          labels,
          new Date("2027-03-28T22:30:00Z"),
        ),
      ).toBe("Yesterday")
      expect(
        formatChatMessageDate(
          "2027-10-30T23:15:00Z",
          "en-US",
          labels,
          new Date("2027-10-31T23:30:00Z"),
        ),
      ).toBe("Yesterday")
    })

    it("keeps the active locale while displaying Berlin dates and hours", () => {
      const now = new Date("2027-07-02T12:30:00Z")
      expect(formatChatMessageDate("2027-06-29T22:15:00Z", "en-US", labels, now)).toBe(
        "Jun 30, 2027",
      )
      expect(formatChatMessageTime("2027-03-28T12:05:00Z", "en-GB")).toBe("14:05")
      expect(formatChatMessageTime("2027-10-31T13:05:00Z", "de-DE")).toBe("14:05")
    })

    it("shows a divider when the Berlin day changes", () => {
      expect(shouldShowChatDateDivider("2027-07-01T22:01:00Z", undefined)).toBe(true)
      expect(shouldShowChatDateDivider("2027-07-01T22:01:00Z", "2027-07-01T21:59:00Z")).toBe(true)
      expect(shouldShowChatDateDivider("2027-07-02T01:00:00Z", "2027-07-01T22:01:00Z")).toBe(false)
    })

    it("tolerates missing or invalid saved dates", () => {
      expect(parseChatMessageDate(undefined)).toBeNull()
      expect(parseChatMessageDate("not-a-date")).toBeNull()
      expect(formatChatMessageDate(undefined, "en-US", labels)).toBeNull()
      expect(formatChatMessageTime("not-a-date", "en-US")).toBeNull()
      expect(shouldShowChatDateDivider(undefined, new Date("2027-07-02T00:00:00Z"))).toBe(false)
    })
  },
)
