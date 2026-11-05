import { useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { trpc } from "@/utils/trpc"
import { toast } from "@/components/ui/use-toast"
import { useI18n } from "@/locales/i18n"

/** Short, bounded reads work across Vercel instances and release resources. */
export function useRealtimeNotifications() {
  const { data: session } = useSession()
  const { t } = useI18n()
  const seen = useRef<{ userId: string; ids: Set<string> } | null>(null)
  const userId = session?.user?.id
  const query = trpc.notifications.getAll.useQuery(undefined, {
    enabled: Boolean(userId),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })
  useEffect(() => {
    if (!userId || !query.data) return
    const current = new Set(query.data.map((n) => n.id))
    if (seen.current?.userId === userId) {
      for (const notification of query.data) {
        if (!notification.read && !seen.current.ids.has(notification.id)) {
          toast({ title: t("notifications.newNotification"), description: t("notifications.checkNotifications"), duration: 5000 })
        }
      }
    }
    seen.current = { userId, ids: current }
  }, [query.data, userId, t])
  return { isConnected: Boolean(userId) && query.isSuccess }
}
