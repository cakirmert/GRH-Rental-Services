"use client"

import React, { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type Props = {
  children: React.ReactNode
  className?: string
  as?: keyof JSX.IntrinsicElements
  delayMs?: number
  threshold?: number
  once?: boolean
}

/**
 * Minimal intersection-based reveal. Fades and slides up when in view.
 */
export default function Reveal({
  children,
  className,
  as = "div",
  delayMs = 80,
  threshold = 0.2,
  once = true,
}: Props) {
  const Comp = as as any
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          if (once) io.disconnect()
        } else if (!once) {
          setVisible(false)
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold, once])

  return (
    <Comp
      ref={ref as any}
      className={cn(
        "transition-all duration-700 ease-out will-change-transform",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        className,
      )}
      style={{ transitionDelay: `${Math.max(0, delayMs)}ms` }}
    >
      {children}
    </Comp>
  )
}

