"use client"

import { useState, useRef, DragEvent } from "react"
import Image from "next/image"
import { trpc } from "@/utils/trpc"
import clsx from "clsx"
import { useI18n } from "@/locales/i18n"

interface ItemImagesFieldProps {
  initialImages: string[]
  itemId?: string
  onChange?: (images: string[]) => void
}

// add upload response type
interface UploadResponse {
  imageUrl: string
}

export default function ItemImagesField({ initialImages, itemId, onChange }: ItemImagesFieldProps) {
  const { t } = useI18n()
  const [images, setImages] = useState<string[]>(initialImages)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const utils = trpc.useContext()

  const uploadImageMutation = trpc.upload.uploadItemImage.useMutation({
    onSuccess: (data: UploadResponse) => {
      if (data.imageUrl) setImages((prev) => [...prev, data.imageUrl])
    },
  })

  const updateImagesMutation = trpc.admin.updateImages.useMutation({
    onSuccess: () => {
      utils.admin.items.list.invalidate()
    },
  })

  const handleAddFiles = async (files: FileList) => {
    const newImages = [...images]
    for (const file of Array.from(files)) {
      const content = await file.arrayBuffer()
      const base64 = Buffer.from(content).toString("base64")
      const res = await uploadImageMutation.mutateAsync({
        fileName: file.name,
        fileContentBase64: base64,
      })
      if (res?.imageUrl) newImages.push(res.imageUrl)
    }
    setImages(newImages)
    if (itemId) updateImagesMutation.mutate({ itemId, images: newImages })
    if (onChange) onChange(newImages)
  }

  const onFileInputChange = () => {
    const files = fileInputRef.current?.files
    if (files && files.length > 0) {
      handleAddFiles(files)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const onDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString())
    setDraggingIdx(index)
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const onDrop = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    const draggedIndex = Number(e.dataTransfer.getData("text/plain"))
    if (isNaN(draggedIndex)) return
    changeIndex(draggedIndex, index + 1)
    setDraggingIdx(null)
  }

  const changeIndex = (oldIndex: number, newIndex: number) => {
    if (newIndex < 1) newIndex = 1
    if (newIndex > images.length) newIndex = images.length
    const newArr = [...images]
    const [moved] = newArr.splice(oldIndex, 1)
    newArr.splice(newIndex - 1, 0, moved)
    setImages(newArr)
    if (itemId) updateImagesMutation.mutate({ itemId, images: newArr })
    if (onChange) onChange(newArr)
  }

  const removeImage = (removeIndex: number) => {
    const newImages = images.filter((_, idx) => idx !== removeIndex)
    setImages(newImages)
    if (itemId) updateImagesMutation.mutate({ itemId, images: newImages })
    if (onChange) onChange(newImages)
  }

  return (
    <div className="space-y-4">
      <label className="block font-medium text-gray-700">
        {t("adminDashboard.items.form.images")}
      </label>
      <div className="grid auto-rows-[120px] grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {images.map((url, idx) => (
          <div key={url} className="flex flex-col items-center space-y-1 w-[120px]">
            <div
              draggable
              onDragStart={(e) => onDragStart(e, idx)}
              onDragEnd={() => setDraggingIdx(null)}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, idx)}
              className={clsx(
                "relative border rounded p-1 w-full aspect-square",
                "cursor-grab active:cursor-grabbing",
                draggingIdx === idx && "ring-2 ring-primary opacity-75",
              )}
            >
              <Image
                src={url}
                alt={t("adminDashboard.items.form.imageNumberAlt", { number: idx + 1 })}
                fill
                sizes="120px"
                className="object-cover rounded"
              />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 bg-red-600 text-white text-xs px-1 py-0.5 rounded opacity-75 hover:opacity-100"
                aria-label={t("adminDashboard.items.form.removeImage")}
              >
                ✕
              </button>
            </div>
            <span className="text-xs text-muted-foreground">{idx + 1}</span>
          </div>
        ))}
        <div
          className="border-dashed border-2 border-gray-300 rounded flex items-center justify-center text-sm text-gray-600 w-[120px] h-[120px]"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDrop={(e) => {
            e.preventDefault()
            if (e.dataTransfer.files.length) {
              handleAddFiles(e.dataTransfer.files)
            }
          }}
        >
          {t("adminDashboard.items.form.uploadImage")}
        </div>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        multiple
        accept="image/*"
        className="hidden"
        onChange={onFileInputChange}
      />
      <p className="text-xs text-muted-foreground">{t("adminDashboard.items.form.reorderHint")}</p>
    </div>
  )
}
