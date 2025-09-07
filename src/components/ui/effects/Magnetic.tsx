"use client"

import React, { useRef } from "react"

type Props = {
  children: React.ReactNode
  strength?: number // max px translation
  className?: string
}

/**
 * Magnetic hover: nudges content slightly toward the pointer.
 */
export default function Magnetic({ children, strength = 6, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1 // -1..1
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1
    el.style.transform = `translate(${(x * strength).toFixed(2)}px, ${(y * strength).toFixed(2)}px)`
  }

  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.transform = "translate(0, 0)"
  }

  return (
    <div
      className={className}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ transition: "transform 120ms ease-out" }}
    >
      <div ref={ref}>{children}</div>
    </div>
  )
}

