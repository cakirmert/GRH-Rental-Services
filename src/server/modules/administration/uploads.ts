import { assertAdmin } from "../shared/operation"
import { administrationEffects, type AdministrationEffects } from "./effects"

import { OperationError, type OperationContext } from "../shared/operation"

import type * as contracts from "./contracts"

import path from "node:path"
import { randomUUID } from "node:crypto"
const MAX_IMAGE_BYTES = 7.5 * 1024 * 1024
export function decodeImageUpload(base64: string, fileExtension: string) {
  const normalizedBase64 = base64.trim()
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
    throw new OperationError({ code: "BAD_REQUEST", message: "Invalid image data." })
  }

  const buffer = Buffer.from(normalizedBase64, "base64")
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new OperationError({ code: "BAD_REQUEST", message: "Invalid image size." })
  }

  const isJpeg =
    fileExtension === ".jpg" || fileExtension === ".jpeg"
      ? buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      : false
  const isPng =
    fileExtension === ".png" &&
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  const isWebp =
    fileExtension === ".webp" &&
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  const isGif =
    fileExtension === ".gif" &&
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
      buffer.subarray(0, 6).toString("ascii") === "GIF89a")

  if (!isJpeg && !isPng && !isWebp && !isGif) {
    throw new OperationError({
      code: "BAD_REQUEST",
      message: "Image content does not match file type.",
    })
  }

  return buffer
}

export async function uploadItemImage(
  context: OperationContext,
  input: contracts.UploadItemImageInput,
  effects: AdministrationEffects = administrationEffects,
) {
  assertAdmin(context.actor)
  effects.assertUploadsEnabled()
  try {
    const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"]
    const fileExtension = path.extname(input.fileName).toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      throw new OperationError({
        code: "BAD_REQUEST",
        message: "Invalid file type. Only JPG, PNG, WEBP, and GIF are allowed.",
      })
    }

    const uniqueFileName = `items/${randomUUID()}${fileExtension}`
    const buffer = decodeImageUpload(input.fileContentBase64, fileExtension)

    // Map extension to content type
    const mimeType =
      fileExtension === ".jpg" || fileExtension === ".jpeg"
        ? "image/jpeg"
        : `image/${fileExtension.slice(1)}`

    const { url } = await effects.storeImage(uniqueFileName, buffer, mimeType)
    return { imageUrl: url }
  } catch (error) {
    if (error instanceof OperationError) throw error
    console.error("Image upload failed:", error)
    throw new OperationError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Image upload failed. Please try again.",
    })
  }
}
