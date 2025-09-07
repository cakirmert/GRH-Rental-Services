"use client"

import React, { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

type Props = {
  size?: number // diameter in px
  strength?: number // 0..1
  className?: string
}

/**
 * Spotlight cursor effect: a faint radial highlight following the pointer.
 * Uses CSS variables updated via rAF for minimal re-renders.
 */
export default function Spotlight({ size = 600, strength = 0.22, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const pos = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const handle = (e: PointerEvent) => {
      pos.current.x = e.clientX
      pos.current.y = e.clientY
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          const el = ref.current
          if (!el) return
          el.style.setProperty("--spot-x", `${pos.current.x}px`)
          el.style.setProperty("--spot-y", `${pos.current.y}px`)
        })
      }
    }
    window.addEventListener("pointermove", handle, { passive: true })
    return () => {
      window.removeEventListener("pointermove", handle)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const opacity = Math.max(0, Math.min(1, strength))
  const style: React.CSSProperties = {
    backgroundImage: `radial-gradient(${size}px ${size}px at var(--spot-x, -9999px) var(--spot-y, -9999px), oklch(0.85 0.08 250 / ${opacity}), transparent 60%)`,
  }

  return (
    <div
      aria-hidden
      ref={ref}
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300",
        "dark:opacity-70 opacity-90",
        className,
      )}
      style={style}
    />
  )
}

