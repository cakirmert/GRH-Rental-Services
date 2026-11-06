import { put } from "@vercel/blob"
import { revalidateTag } from "next/cache"
import { EQUIPMENT_CACHE_TAG } from "@/app/_data/equipment"
import { logAction } from "@/lib/logger"
import { OperationError } from "../shared/operation"

export const administrationEffects = {
  recordAudit: logAction,
  inventoryChanged: async () => {
    await revalidateTag(EQUIPMENT_CACHE_TAG, "default")
  },
  assertUploadsEnabled: () => {
    if (process.env.VERCEL_ENV === "preview" || process.env.DISABLE_OUTBOUND === "true")
      throw new OperationError({
        code: "PRECONDITION_FAILED",
        message: "Image uploads are disabled in this environment.",
      })
  },
  storeImage: async (name: string, buffer: Buffer, contentType: string) => {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) throw new Error("Missing BLOB_READ_WRITE_TOKEN")
    return put(name, buffer, { access: "public", token, contentType })
  },
}
export type AdministrationEffects = typeof administrationEffects
