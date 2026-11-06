import type { AppRoute } from "./routing"

type Bookmark = AppRoute | { view: "chat"; bookingId: string }
export type BookmarkParameters = Record<string, string | string[] | undefined>

/** Read old saved entry URLs without changing the address or redirecting. */
export function readBookmark(params: BookmarkParameters): Bookmark | null {
  const value = (key: string) =>
    typeof params[key] === "string" && params[key].length <= 2048 ? params[key] : undefined
  const has = (key: string) => Object.hasOwn(params, key)
  const chat = value("chat")
  if (chat) return { view: "chat", bookingId: chat }
  const item = value("book")
  if (item) return { view: "booking", itemId: item }
  const highlight = value("highlight")
  if (has("bookings") || highlight)
    return { view: "my-bookings", ...(highlight ? { highlightId: highlight } : {}) }
  if (has("rental")) return { view: "rental-dashboard" }
  if (has("admin")) return { view: "admin-dashboard" }
  for (const view of ["about", "contact", "developers", "faq", "imprint", "privacy"] as const)
    if (has(view)) return { view }
  return null
}
