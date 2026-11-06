"use client"

import { useEffect, useRef } from "react"

/** The subtle square grid used by V1, with motion paused in hidden tabs. */
export default function SiteBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return

    const desktop = window.matchMedia("(min-width: 768px)")
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const pitch = 14
    let width = 0
    let height = 0
    let columns = 0
    let rows = 0
    let opacity = new Float32Array(0)
    let targets = new Float32Array(0)
    let frame = 0
    let previous = 0

    function paint(elapsed = 0) {
      context!.clearRect(0, 0, width, height)
      for (let index = 0; index < opacity.length; index++) {
        if (elapsed && Math.random() < 0.3 * elapsed) targets[index] = Math.random() * 0.16
        if (elapsed) opacity[index] += (targets[index] - opacity[index]) * 0.15
        context!.fillStyle = `rgba(120, 113, 108, ${opacity[index]})`
        context!.fillRect((index % columns) * pitch, Math.floor(index / columns) * pitch, 4, 4)
      }
    }

    function animate(time: number) {
      if (time - previous >= 80) {
        paint(Math.min((time - previous) / 1000, 0.15))
        previous = time
      }
      frame = requestAnimationFrame(animate)
    }

    function syncMotion() {
      cancelAnimationFrame(frame)
      previous = 0
      if (desktop.matches && !reducedMotion.matches && !document.hidden)
        frame = requestAnimationFrame(animate)
    }

    function resize() {
      const bounds = canvas!.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.round(width * dpr)
      canvas!.height = Math.round(height * dpr)
      context!.setTransform(dpr, 0, 0, dpr, 0, 0)
      columns = Math.ceil(width / pitch)
      rows = Math.ceil(height / pitch)
      opacity = Float32Array.from({ length: columns * rows }, () => Math.random() * 0.16)
      targets = opacity.slice()
      paint()
      syncMotion()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    reducedMotion.addEventListener("change", syncMotion)
    desktop.addEventListener("change", resize)
    document.addEventListener("visibilitychange", syncMotion)
    resize()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      reducedMotion.removeEventListener("change", syncMotion)
      desktop.removeEventListener("change", resize)
      document.removeEventListener("visibilitychange", syncMotion)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-site-background
      className="pointer-events-none fixed inset-0 -z-10 hidden h-full w-full md:block"
    />
  )
}
