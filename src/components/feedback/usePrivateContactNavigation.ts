"use client"
import { useCallback } from "react"
import { useRouter } from "next/navigation"
export function usePrivateContactNavigation() {
  const router = useRouter()
  return useCallback(() => router.push("/contact"), [router])
}
