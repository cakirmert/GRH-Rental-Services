"use client"

import React from "react"
import { cn } from "@/lib/utils"

type Props = {
  className?: string
}

/**
 * Soft animated aurora-style background. Inspired by patterns on reactbits.dev
 * Renders three blurred color blobs with gentle movement.
 */
export function AuroraBackground({ className }: Props) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        "[mask-image:radial-gradient(ellipse_at_center,white,transparent_70%)]",
        className,
      )}
    >
      <div className="absolute -top-32 -left-24 h-[40rem] w-[40rem] rounded-full bg-[oklch(0.77_0.15_270)] opacity-30 blur-3xl aurora-blob" />
      <div className="absolute -bottom-32 -right-24 h-[44rem] w-[44rem] rounded-full bg-[oklch(0.8_0.12_210)] opacity-25 blur-3xl aurora-blob" />
      <div className="absolute top-1/3 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[oklch(0.82_0.13_150)] opacity-20 blur-3xl aurora-blob" />
    </div>
  )
}

export default AuroraBackground

