import { useMemo, useSyncExternalStore } from "react"

const serverMatch = () => false

/**
 * Hook that tracks whether a CSS media query matches the current viewport
 * @param query - The CSS media query string to match
 * @returns Boolean indicating whether the media query matches
 */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => {
    const media = typeof window === "undefined" ? null : window.matchMedia(query)
    return {
      getSnapshot: () => media?.matches ?? false,
      subscribe: (notify: () => void) => {
        media?.addEventListener("change", notify)
        return () => media?.removeEventListener("change", notify)
      },
    }
  }, [query])
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverMatch)
}
