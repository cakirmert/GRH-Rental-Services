"use client"

import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Users, ChevronLeft, ChevronRight } from "lucide-react"
import { useI18n } from "@/locales/i18n"
import { useState } from "react"
import { getOptimizedImageUrls } from "@/lib/imageUtils"

export interface Item {
  id: string
  name: string
  type: "sports" | "room" | "game" | "other"
  capacity?: number
  category?: string
  players?: string
  images?: string[]
  description?: string
  rules?: string | string[]
  totalQuantity?: number
}

interface ItemCardProps {
  item: Item
  onSelectItem: (item: Item) => void
}

function getObjectFitMode(imagePath: string): "cover" | "contain" {
  const extension = imagePath.toLowerCase().split(".").pop()
  return extension === "jpg" ? "cover" : "contain"
}

export function ItemCard({ item, onSelectItem }: ItemCardProps) {
  const { t } = useI18n()

  const [current, setCurrent] = useState(0)
  const [isSliding, setIsSliding] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const rawImages = item.images && item.images.length > 0 ? item.images : ["/placeholder.svg"]
  const images = getOptimizedImageUrls(rawImages)

  const fitMode = getObjectFitMode(images[current])

  const next = () => {
    if (isSliding) return
    setIsSliding(true)
    setCurrent((prev) => (prev + 1) % images.length)
    setTimeout(() => setIsSliding(false), 300)
  }

  const prev = () => {
    if (isSliding) return
    setIsSliding(true)
    setCurrent((prev) => (prev - 1 + images.length) % images.length)
    setTimeout(() => setIsSliding(false), 300)
  }

  // Handle touch events for swipe functionality
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 50
    const isRightSwipe = distance < -50

    if (isLeftSwipe && images.length > 1) {
      next()
    }
    if (isRightSwipe && images.length > 1) {
      prev()
    }
  }

  const translatedDescription = item.description ? t(item.description) : ""
  return (
    <Card className="rounded-xl border bg-card/40 hover:bg-card/60 hover:shadow-md hover:shadow-black/10 dark:hover:shadow-white/10 transition-all duration-300 flex flex-col h-full group overflow-hidden">
      {" "}
      <CardHeader className="p-0">
        <div
          className="relative w-full h-56 overflow-hidden select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <Image
            src={images[current]}
            alt={item.name}
            fill
            className={`object-${fitMode} transition-opacity duration-200 group-hover:opacity-95 select-none pointer-events-none`}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={false}
            draggable={false}
          />{" "}
          {images.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-0 top-0 w-16 h-full flex items-center justify-center bg-gradient-to-r from-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 hover:from-black/30"
                disabled={isSliding}
              >
                <div className="bg-white/50  p-2 rounded-full shadow-lg transition-all duration-200">
                  <ChevronLeft className="h-5 w-5 text-gray-700" />
                </div>
              </button>
              <button
                onClick={next}
                className="absolute right-0 top-0 w-16 h-full flex items-center justify-center bg-gradient-to-l from-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 hover:from-black/30"
                disabled={isSliding}
              >
                <div className="bg-white/50  p-2 rounded-full shadow-lg transition-all duration-200">
                  <ChevronRight className="h-5 w-5 text-gray-700" />
                </div>
              </button>
              {/* Image indicator dots */}
              <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
                {images.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => !isSliding && setCurrent(index)}
                    className={`w-2 h-2 rounded-full transition-all duration-200 ${index === current ? "bg-white shadow-md" : "bg-white/50 hover:bg-white/75"
                      }`}
                    disabled={isSliding}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </CardHeader>{" "}
      {/* Use consistent padding */}
      <CardContent className="p-6 flex flex-col flex-grow">
        <CardTitle className="text-xl font-bold mb-3 leading-tight text-foreground">
          {item.name}
        </CardTitle>
        <CardDescription className="line-clamp-2 text-sm text-muted-foreground mb-4 flex-grow leading-relaxed">
          {translatedDescription || t("itemCard.noDescriptionAvailable")}
        </CardDescription>

        {/* Badges section */}
        <div className="flex flex-wrap gap-2 mt-auto">
          {" "}
          {item.capacity && (
            <Badge
              variant="outline"
              className="flex items-center px-3 py-1.5 font-medium border-primary/20"
            >
              <Users className="h-4 w-4 mr-2" />
              {t("common.capacity")}: {item.capacity}
            </Badge>
          )}
          {item.players && (
            <Badge
              variant="outline"
              className="flex items-center px-3 py-1.5 font-medium border-primary/20"
            >
              <Users className="h-4 w-4 mr-2" />
              {t("common.players")}: {item.players}
            </Badge>
          )}
          {!item.players && !item.capacity && item.totalQuantity !== undefined && (
            <Badge
              variant="outline"
              className="flex items-center px-3 py-1.5 font-medium border-primary/20"
            >
              {t("common.available")}: {item.totalQuantity}
            </Badge>
          )}
        </div>
      </CardContent>{" "}
      <CardFooter className="p-6 pt-0">
        <Button
          variant="default"
          size="lg"
          className="w-full font-semibold transition-all duration-200 hover:shadow-md"
          onClick={() => onSelectItem(item)}
        >
          {t("itemCard.viewAndBookButton")}
        </Button>
      </CardFooter>
    </Card>
  )
}
