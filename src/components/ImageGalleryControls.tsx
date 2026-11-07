"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { useI18n } from "@/locales/i18n"

const controlClassName =
  "gallery-control absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/55 text-stone-800 shadow-sm backdrop-blur-sm transition-[opacity,background-color] duration-150 hover:bg-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"

export function ImageGalleryControls({
  onPrevious,
  onNext,
  disabled = false,
}: {
  onPrevious: () => void
  onNext: () => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  return (
    <>
      <button
        type="button"
        onClick={onPrevious}
        disabled={disabled}
        aria-label={t("common.previousImage")}
        className={`${controlClassName} left-3`}
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        aria-label={t("common.nextImage")}
        className={`${controlClassName} right-3`}
      >
        <ChevronRight aria-hidden="true" className="size-5" />
      </button>
    </>
  )
}
