import prisma from "./prismadb"
import { LogType } from "@prisma/client"

export async function logAction({
  type,
  userId,
  bookingId,
  message,
}: {
  type: LogType
  userId?: string
  bookingId?: string
  message: string
}) {
  try {
    await prisma.log.create({
      data: { type, userId, bookingId, message },
    })
  } catch (err) {
    console.error("Log failed", err)
  }
}
