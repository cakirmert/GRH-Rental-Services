import type { AppRoute } from "@/types/routing"

// Re-export for backward compatibility
export type { AppRoute }

/**
 * Convert route object to URL path using search parameters
 * @param route - The route object to convert
 * @returns URL path string
 */
export function routeToPath(route: AppRoute): string {
  switch (route.view) {
    case "list":
      return "/"
    case "booking":
      return `/?book=${encodeURIComponent(route.itemId)}`
    case "my-bookings":
      return route.highlightId
        ? `/?bookings&highlight=${encodeURIComponent(route.highlightId)}`
        : "/?bookings"
    case "rental-dashboard":
      return "/?rental"
    case "admin-dashboard":
      return "/?admin"
    case "about":
      return "/?about"
    case "contact":
      return "/?contact"
    case "developers":
      return "/?developers"
    case "faq":
      return "/?faq"
    case "imprint":
      return "/?imprint"
    case "privacy":
      return "/?privacy"
    default:
      return "/"
  }
}

/**
 * Parse URL path to route object using search parameters
 * @param pathname - The URL pathname
 * @param searchParams - The URL search parameters
 * @returns Parsed route object
 */
export function pathToRoute(pathname: string, searchParams: URLSearchParams): AppRoute {
  const bookItemId = searchParams.get("book")
  if (bookItemId) {
    return { view: "booking", itemId: bookItemId }
  }

  if (searchParams.has("bookings")) {
    const highlightId = searchParams.get("highlight")
    return { view: "my-bookings", highlightId: highlightId || undefined }
  }

  if (searchParams.has("rental")) {
    return { view: "rental-dashboard" }
  }

  if (searchParams.has("admin")) {
    return { view: "admin-dashboard" }
  }

  if (searchParams.has("about")) {
    return { view: "about" }
  }

  if (searchParams.has("contact")) {
    return { view: "contact" }
  }

  if (searchParams.has("developers")) {
    return { view: "developers" }
  }

  if (searchParams.has("faq")) {
    return { view: "faq" }
  }

  if (searchParams.has("imprint")) {
    return { view: "imprint" }
  }

  if (searchParams.has("privacy")) {
    return { view: "privacy" }
  }

  return { view: "list" }
}

/**
 * Navigate to a route using History API (no page reload)
 * @param route - The route to navigate to
 * @param replace - Whether to replace the current history entry
 */
export function navigateToRoute(route: AppRoute, replace = false): void {
  const path = routeToPath(route)

  if (replace) {
    window.history.replaceState(null, "", path)
  } else {
    window.history.pushState(null, "", path)
  }
}

/**
 * Get current route from browser URL
 * @returns Current route object
 */
export function getCurrentRoute(): AppRoute {
  if (typeof window === "undefined") {
    return { view: "list" }
  }

  const url = new URL(window.location.href)
  const route = pathToRoute(url.pathname, url.searchParams)
  return route
}
