"use client"

import { useCallback, useMemo, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { pathToRoute, routeToPath } from "@/utils/routing"
import { View, type ViewContextType, type AppRoute } from "@/types"

export { View }

/** Compatibility boundary for retained widgets; Next's URL is the only route state. */
export function ViewProvider({ children }: { children: ReactNode }) { return children }

const views: Record<AppRoute["view"], View> = {
  list: View.LIST, booking: View.BOOKING, "my-bookings": View.MY_BOOKINGS,
  "rental-dashboard": View.RENTAL_DASHBOARD, "admin-dashboard": View.ADMIN_DASHBOARD,
  about: View.ABOUT, contact: View.CONTACT, developers: View.DEVELOPERS,
  faq: View.FAQ, imprint: View.IMPRINT, privacy: View.PRIVACY,
}

export function useView(): ViewContextType {
  const router = useRouter()
  const pathname = usePathname() ?? "/"
  const currentRoute = useMemo(() => pathToRoute(pathname), [pathname])
  const setView = useCallback((view: View, itemId?: string, highlightId?: string) => {
    const kind = (Object.entries(views).find(([, value]) => value === view)?.[0] ?? "list") as AppRoute["view"]
    if (kind === "booking" && !itemId) throw new Error("An item is required for a booking.")
    const route = kind === "booking" ? { view: kind, itemId: itemId! }
      : kind === "my-bookings" ? { view: kind, highlightId }
      : { view: kind }
    router.push(routeToPath(route as AppRoute))
  }, [router])
  return { view: views[currentRoute.view], currentRoute, setView }
}
