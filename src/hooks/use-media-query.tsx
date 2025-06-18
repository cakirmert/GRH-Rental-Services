import { useState, useEffect } from "react"

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false)

  useEffect(() => {
    // Ensure window is defined (for SSR compatibility)
    if (typeof window === "undefined") {
      return
    }

    const mediaQueryList = window.matchMedia(query)

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    // Set initial state
    setMatches(mediaQueryList.matches)

    // Add listener using the recommended addEventListener method
    mediaQueryList.addEventListener("change", listener)

    // Cleanup listener on component unmount
    return () => {
      mediaQueryList.removeEventListener("change", listener)
    }
  }, [query]) // Re-run effect if query changes

  return matches
}
