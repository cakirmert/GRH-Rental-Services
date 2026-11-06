"use client"

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes"

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class" // Explicitly set the attribute to 'class'
      defaultTheme="system" // Add defaultTheme prop
      {...props}
      enableSystem
      disableTransitionOnChange
      storageKey="grh-booking-theme"
    >
      {children}
    </NextThemesProvider>
  )
}
