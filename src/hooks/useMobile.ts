import { useMediaQuery } from "./useMediaQuery"

const MOBILE_BREAKPOINT = 768

/**
 * Hook that tracks whether the current viewport is in mobile mode
 * @returns Boolean indicating whether the screen is mobile-sized
 */
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}
