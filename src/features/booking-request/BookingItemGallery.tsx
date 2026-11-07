"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { AlertCircle } from "lucide-react"
import { ImageGalleryControls } from "@/components/ImageGalleryControls"
import { getOptimizedImageUrls } from "@/lib/imageUtils"
import { useI18n } from "@/locales/i18n"
import { Skeleton } from "@/components/ui/skeleton"
import type { BookingItem } from "./types"

export function BookingItemGallery({ item }: { item: BookingItem }) {
  const { t } = useI18n()
  const images = getOptimizedImageUrls(item.images ?? [])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const currentImage = Math.min(selectedIndex, Math.max(0, images.length - 1))
  const touchStart = useRef<number | null>(null)
  if (!images.length) return null
  const move = (delta: number) =>
    setSelectedIndex((currentImage + delta + images.length) % images.length)

  return (
    <div className="space-y-2">
      <div
        data-image-gallery
        className="relative w-full overflow-hidden rounded-lg shadow aspect-video select-none group"
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(event) => {
          const end = event.changedTouches[0]?.clientX
          if (touchStart.current !== null && end !== undefined && images.length > 1) {
            const distance = touchStart.current - end
            if (Math.abs(distance) > 50) move(distance > 0 ? 1 : -1)
          }
          touchStart.current = null
        }}
        onTouchCancel={() => {
          touchStart.current = null
        }}
      >
        <GalleryImage
          key={images[currentImage]}
          src={images[currentImage]}
          alt={`${item.name} ${currentImage + 1}`}
        />
        {images.length > 1 && (
          <ImageGalleryControls onPrevious={() => move(-1)} onNext={() => move(1)} />
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-1">
          {images.map((src, index) => (
            <button
              key={`${src}:${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={t("common.viewImageN", { n: index + 1 })}
              aria-pressed={index === currentImage}
              className={`relative h-16 w-16 my-2 shrink-0 rounded-md overflow-hidden focus-visible:ring-2 focus-visible:ring-ring ${index === currentImage ? "ring-2 ring-primary shadow-md" : "hover:ring-1 hover:ring-border"}`}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function GalleryImage({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading")
  const [portrait, setPortrait] = useState(false)
  return (
    <>
      {state === "loading" && <Skeleton className="absolute inset-0 h-full w-full" />}
      <Image
        src={src}
        alt={alt}
        fill
        preload
        sizes="(max-width: 768px) 100vw, 50vw"
        draggable={false}
        className={`${portrait ? "object-contain" : "object-cover"} pointer-events-none`}
        onLoad={(event) => {
          setState("loaded")
          setPortrait(event.currentTarget.naturalHeight > event.currentTarget.naturalWidth)
        }}
        onError={() => setState("error")}
      />
      {state === "error" && (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card text-muted-foreground"
        >
          <AlertCircle aria-hidden="true" className="h-8 w-8" />
          <p className="text-sm">{alt}</p>
        </div>
      )}
    </>
  )
}
