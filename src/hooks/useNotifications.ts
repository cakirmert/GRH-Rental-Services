import { useEffect, useState } from "react"
import { trpc } from "@/utils/trpc"

export function useNotifications() {
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  )

  const query = trpc.notifications.getAll.useQuery(undefined, {
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: visible,
  })

  useEffect(() => {
    const handleVisibility = () => {
      const isVisible = document.visibilityState === "visible"
      setVisible(isVisible)
      if (isVisible) {
        query.refetch()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [query])

  return query
}
