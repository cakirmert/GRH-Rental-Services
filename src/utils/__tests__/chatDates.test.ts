import { describe, expect, it } from "vitest"
import {
  formatChatMessageDate,
  formatChatMessageTime,
  parseChatMessageDate,
  shouldShowChatDateDivider,
} from "@/utils/chatDates"

const labels = {
  today: "Today",
  yesterday: "Yesterday",
}

describe("chat date formatting", () => {
  it("labels messages from today and yesterday", () => {
    const now = new Date(2026, 6, 2, 14, 30)

    expect(formatChatMessageDate(new Date(2026, 6, 2, 9, 15), "en-US", labels, now)).toBe("Today")
    expect(formatChatMessageDate(new Date(2026, 6, 1, 23, 45), "en-US", labels, now)).toBe(
      "Yesterday",
    )
  })

  it("uses the active locale for older dates and message times", () => {
    const now = new Date(2026, 6, 2, 14, 30)

    expect(formatChatMessageDate(new Date(2026, 5, 30, 9, 15), "en-US", labels, now)).toBe(
      "Jun 30, 2026",
    )
    expect(formatChatMessageTime(new Date(2026, 6, 2, 9, 5), "en-GB")).toBe("09:05")
  })

  it("shows a divider for the first valid date and when the local day changes", () => {
    expect(shouldShowChatDateDivider(new Date(2026, 6, 2, 9), undefined)).toBe(true)
    expect(shouldShowChatDateDivider(new Date(2026, 6, 2, 12), new Date(2026, 6, 2, 9))).toBe(false)
    expect(shouldShowChatDateDivider(new Date(2026, 6, 2, 9), new Date(2026, 6, 1, 23))).toBe(true)
  })

  it("tolerates missing or invalid saved dates", () => {
    expect(parseChatMessageDate(undefined)).toBeNull()
    expect(parseChatMessageDate("not-a-date")).toBeNull()
    expect(formatChatMessageDate(undefined, "en-US", labels)).toBeNull()
    expect(formatChatMessageTime("not-a-date", "en-US")).toBeNull()
    expect(shouldShowChatDateDivider(undefined, new Date(2026, 6, 2))).toBe(false)
  })
})
