"use client"
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useCurrentAccount } from "./client"

/** Revalidate server permission boundaries after login or an account/role change. */
export default function RefreshSessionBoundary() {
  const { user, status } = useCurrentAccount()
  const router = useRouter()
  const previous = useRef<string | null>(null)
  const identity = user ? JSON.stringify([user.id, user.role, user.isSuperAdmin]) : "guest"
  useEffect(() => {
    if (status === "loading") return
    if (previous.current !== null && previous.current !== identity) router.refresh()
    previous.current = identity
  }, [identity, status, router])
  return null
}
