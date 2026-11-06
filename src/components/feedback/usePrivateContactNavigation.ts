"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useView, View } from "@/contexts/ViewContext"

export function usePrivateContactNavigation() {
  const pathname = usePathname()
  const router = useRouter()
  const { setView } = useView()
  const pendingContact = useRef(false)
  // The root layout persists across routes. Once HomeShell mounts, synchronize
  // its view context with the contact URL requested from a 404/other page.
  useEffect(() => {
    if (pendingContact.current && pathname === "/") {
      pendingContact.current = false
      setView(View.CONTACT)
    }
  }, [pathname, setView])
  return () => {
    if (pathname === "/") setView(View.CONTACT)
    else {
      pendingContact.current = true
      router.push("/?contact")
    }
  }
}
