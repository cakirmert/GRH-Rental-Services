// src/contexts/ViewContext.tsx
"use client"

import React, { createContext, useState, useContext, ReactNode, useEffect } from "react"
import { setNavigatingBetweenViews } from "@/components/BookingFormView"
import { getCurrentRoute, navigateToRoute, type AppRoute } from "@/utils/clientRouter"

// Define the possible views in your application
export enum View {
  LIST = "list",
  BOOKING = "booking",
  MY_BOOKINGS = "myBookings",
  RENTAL_DASHBOARD = "rentalDashboard",
  ADMIN_DASHBOARD = "adminDashboard",
  ABOUT = "about",
  CONTACT = "contact",
  DEVELOPERS = "developers",
  FAQ = "faq",
  IMPRINT = "imprint",
  PRIVACY = "privacy",
  // Add other views as needed
}

interface ViewContextType {
  view: View
  setView: (view: View, itemId?: string, highlightId?: string) => void
  currentRoute: AppRoute
}

const ViewContext = createContext<ViewContextType | undefined>(undefined)

export const ViewProvider = ({ children }: { children: ReactNode }) => {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    if (typeof window === "undefined") return { view: "list" }
    return getCurrentRoute()
  })

  // Convert route to view enum
  const routeToViewEnum = (route: AppRoute): View => {
    switch (route.view) {
      case "list":
        return View.LIST
      case "booking":
        return View.BOOKING
      case "my-bookings":
        return View.MY_BOOKINGS
      case "rental-dashboard":
        return View.RENTAL_DASHBOARD
      case "admin-dashboard":
        return View.ADMIN_DASHBOARD
      case "about":
        return View.ABOUT
      case "contact":
        return View.CONTACT
      case "developers":
        return View.DEVELOPERS
      case "faq":
        return View.FAQ
      case "imprint":
        return View.IMPRINT
      case "privacy":
        return View.PRIVACY
      default:
        return View.LIST
    }
  }

  const [view, setViewState] = useState<View>(() => routeToViewEnum(currentRoute))

  // Initialize view from URL on mount (handle page refresh)
  useEffect(() => {
    const route = getCurrentRoute()
    setCurrentRoute(route)
    setViewState(routeToViewEnum(route))
  }, []) // Run once on mount

  const setView = (v: View, itemId?: string, highlightId?: string) => {
    // Mark that we're navigating between views (not refreshing)
    setNavigatingBetweenViews(true)

    // Create route object
    let route: AppRoute
    switch (v) {
      case View.LIST:
        route = { view: "list" }
        break
      case View.BOOKING:
        if (!itemId) throw new Error("itemId required for booking view")
        route = { view: "booking", itemId }
        break
      case View.MY_BOOKINGS:
        route = { view: "my-bookings", highlightId }
        break
      case View.RENTAL_DASHBOARD:
        route = { view: "rental-dashboard" }
        break
      case View.ADMIN_DASHBOARD:
        route = { view: "admin-dashboard" }
        break
      case View.ABOUT:
        route = { view: "about" }
        break
      case View.CONTACT:
        route = { view: "contact" }
        break
      case View.DEVELOPERS:
        route = { view: "developers" }
        break
      case View.FAQ:
        route = { view: "faq" }
        break
      case View.IMPRINT:
        route = { view: "imprint" }
        break
      case View.PRIVACY:
        route = { view: "privacy" }
        break
      default:
        route = { view: "list" }
    }

    // Update URL without page reload
    navigateToRoute(route)

    // Update state
    setCurrentRoute(route)
    setViewState(v)
    localStorage.setItem("grh-booking-view", v)
  }

  // Listen for browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const route = getCurrentRoute()
      setCurrentRoute(route)
      setViewState(routeToViewEnum(route))
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  return (
    <ViewContext.Provider value={{ view, setView, currentRoute }}>{children}</ViewContext.Provider>
  )
}

export const useView = (): ViewContextType => {
  const context = useContext(ViewContext)
  if (context === undefined) {
    throw new Error("useView must be used within a ViewProvider")
  }
  return context
}
