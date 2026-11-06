import type { AppRoute } from "@/types/routing"
export type { AppRoute }

/** Canonical V2 URLs. User-facing routes never encode the view in a query string. */
export function routeToPath(route: AppRoute): string {
  switch (route.view) {
    case "list":
      return "/"
    case "booking":
      return "/items/" + encodeURIComponent(route.itemId)
    case "my-bookings":
      return route.highlightId ? "/bookings/" + encodeURIComponent(route.highlightId) : "/bookings"
    case "rental-dashboard":
      return "/staff"
    case "admin-dashboard":
      return "/admin"
    default:
      return "/" + route.view
  }
}

export function pathToRoute(pathname: string, _searchParams?: URLSearchParams): AppRoute {
  const parts = pathname.split("/").filter(Boolean)
  if (parts[0] === "items" && parts[1]) {
    try {
      return { view: "booking", itemId: decodeURIComponent(parts[1]) }
    } catch {
      return { view: "list" }
    }
  }
  if (parts[0] === "bookings") {
    let highlightId: string | undefined
    try {
      highlightId = parts[1] ? decodeURIComponent(parts[1]) : undefined
    } catch {
      /* Invalid URL has no selection. */
    }
    return { view: "my-bookings", ...(highlightId ? { highlightId } : {}) }
  }
  if (parts[0] === "staff") return { view: "rental-dashboard" }
  if (parts[0] === "admin") return { view: "admin-dashboard" }
  if (["about", "contact", "developers", "faq", "imprint", "privacy"].includes(parts[0])) {
    return { view: parts[0] } as AppRoute
  }
  return { view: "list" }
}
