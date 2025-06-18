"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [mounted, setMounted] = React.useState(false)

  // Only render children once the component has mounted in the browser
  // This prevents hydration errors from different theme rendering on server vs client
  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <NextThemesProvider
      attribute="class" // Explicitly set the attribute to 'class'
      defaultTheme="system" // Add defaultTheme prop
      {...props}
      enableSystem
      disableTransitionOnChange
      storageKey="grh-booking-theme"
    >
      {mounted ? children : <div style={{ visibility: "hidden" }}>{children}</div>}
    </NextThemesProvider>
  )
}
