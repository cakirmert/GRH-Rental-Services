import { describe, it, expect } from "vitest"
import { cn } from "../utils"

describe("cn utility", () => {
  it("merges class names correctly", () => {
    expect(cn("a", null, false, undefined, "b", "c")).toBe("a b c")
  })
})
