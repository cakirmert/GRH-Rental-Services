"use client"

import React from "react"
import { cn } from "@/lib/utils"

type Props = {
  className?: string
  gap?: number // px
  lineColor?: string // any CSS color
}

/**
 * Subtle CSS grid of lines. Inspired by reactbits.dev grid backgrounds.
 */
export function GridBackground({ className, gap = 56, lineColor = "hsl(0 0% 62% / 0.15)" }: Props) {
  const style: React.CSSProperties = {
    backgroundImage: `linear-gradient(to_right, ${lineColor} 1px, transparent 1px), linear-gradient(to_bottom, ${lineColor} 1px, transparent 1px)`,
    backgroundSize: `${gap}px ${gap}px`,
    backgroundPosition: "center",
    maskImage:
      "radial-gradient(ellipse at center, black 40%, transparent 75%)",
    WebkitMaskImage:
      "radial-gradient(ellipse at center, black 40%, transparent 75%)",
  }
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10", className)}
      style={style}
    />
  )
}

export default GridBackground

