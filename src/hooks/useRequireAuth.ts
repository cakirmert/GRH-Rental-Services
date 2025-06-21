import { useEffect } from "react"
import { trpc } from "@/utils/trpc"
import { useAuthModal } from "@/contexts/AuthModalContext"

/**
 * Hook that ensures user authentication, opening the auth modal if not authenticated
 * @returns Boolean indicating whether the user is authenticated
 */
export function useRequireAuth() {
  const { data } = trpc.auth.getSession.useQuery(undefined, { staleTime: 60000 })
  const { openAuthModal } = useAuthModal()
  
  useEffect(() => {
    if (!data) openAuthModal()
  }, [data, openAuthModal])
  
  return !!data
}
