// src/components/SiteBackground.tsx
"use client"

import React, { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useTheme } from "next-themes"
import DarkVeil from "@/components/DarkVeil"

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(!!media?.matches)
    onChange()
    media?.addEventListener?.("change", onChange)
    media?.addListener?.(onChange) // Safari < 14
    return () => {
      media?.removeEventListener?.("change", onChange)
      media?.removeListener?.(onChange)
    }
  }, [])
  return reduced
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener("resize", onResize, { passive: true })
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return isMobile
}

type Props = { children?: React.ReactNode }

export default function SiteBackground({ children }: Props) {
  const { resolvedTheme } = useTheme()
  // Snapshot system preference synchronously for first paint
  const [prefersDark] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      try {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
      } catch {
        return false
      }
    }
    return false
  })
  // Use resolvedTheme when available, otherwise fall back to system preference
  const isDark = resolvedTheme ? resolvedTheme === "dark" : prefersDark
  const reduced = useReducedMotion()
  const isMobile = useIsMobile()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Keep a system-aware fallback only until the veil has had a chance to paint
  const [showFallback, setShowFallback] = useState(true)
  const [mountVeil, setMountVeil] = useState(false)
  useEffect(() => {
    // Mount veil after main content had a chance to paint
    let r: number | null = null
    r = requestAnimationFrame(() => setMountVeil(true))
    return () => {
      if (r) cancelAnimationFrame(r)
    }
  }, [])

  useEffect(() => {
    const onReady = () => setShowFallback(false)
    window.addEventListener('grh-veil-ready', onReady)
    // Safety: hide fallback after a second even if event didn't fire
    const t = setTimeout(onReady, 1000)
    return () => {
      window.removeEventListener('grh-veil-ready', onReady)
      clearTimeout(t)
    }
  }, [])

  const veilProps = useMemo(() => {
    if (isDark) {
      // Tuned for dark mode: a bit stronger & moodier
    return {
      hueShift: 15,                // no hue shift - keep natural colors
      noiseIntensity: 0.005,      // ↓ minimal grain
      scanlineIntensity: 0.0,     // off — scanlines look dirty on light
      scanlineFrequency: 0.0,
      warpAmount: 0.002,          // very subtle motion
      speed: reduced ? 0.1 : 0.5,
      resolutionScale: isMobile ? 0.9 : 1.1,
        patternScale: isMobile ? 0.8 : 1.1,
      brightness: 0,            // brighten/invert pattern for light mode
    }
    }
    // Tuned for light mode: much cleaner & gentler with light colors
    return {
      hueShift: 195,                // no hue shift - keep natural colors
      noiseIntensity: 0.005,      // ↓ minimal grain
      scanlineIntensity: 0.0,     // off — scanlines look dirty on light
      scanlineFrequency: 0.0,
      warpAmount: 0.002,          // very subtle motion
      speed: reduced ? 0.1 : 0.5,
      resolutionScale: isMobile ? 0.9 : 1.1,
        patternScale: isMobile ? 0.8 : 1.1,
      brightness: 1,            // brighten/invert pattern for light mode
    }
  }, [isDark, reduced, isMobile])

  return (
    <>
      {children}

      {/* Pre-hydration fallback: system-aware background to avoid white flash */}
      {showFallback && (
        <>
          <style
            // Applies before hydration to set a dark-safe background if the system prefers dark
            dangerouslySetInnerHTML={{
              __html: `
                #grh-bg-fallback{position:fixed;inset:0;pointer-events:none;z-index:-20;background-color:oklch(1 0 0);} 
                @media (prefers-color-scheme: dark){#grh-bg-fallback{background-color:oklch(0.145 0 0);}}
              `,
            }}
          />
          <div id="grh-bg-fallback" aria-hidden />
        </>
      )}

      {mounted && mountVeil &&
        createPortal(
          <>
            {/* VEIL */}
            <div
              aria-hidden
              className={[
                "pointer-events-none fixed inset-0 -z-10"
                // multiply keeps the pattern visible on white without gray haze
              ].join(" ")}
            >
              <div className="absolute inset-0 darkveil-host">
                <DarkVeil {...veilProps} />
              </div>
            </div>

            {/* SCRIM */}
              <div
                aria-hidden
                className="
                  pointer-events-none fixed inset-0 -z-10
                "
              />
          </>,
          document.body
        )}
    </>
  )
}
