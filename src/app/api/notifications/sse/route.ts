import { NextRequest } from "next/server"
import { auth } from "../../../../../auth"
import { notificationEmitter } from "@/lib/notifications"

interface NotificationData {
  id: string
  userId: string
  bookingId?: string
  type: string
  message: string
  read: boolean
  createdAt: Date
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const userId = session.user.id

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`)

      // Listen for new notifications for this user
      const onNotification = (notification: NotificationData) => {
        if (notification.userId === userId) {
          try {
            controller.enqueue(
              `data: ${JSON.stringify({
                type: "notification",
                data: notification,
              })}\n\n`,
            )
          } catch {
            // Silent error handling for closed connections
          }
        }
      }

      notificationEmitter.on("new", onNotification)

      // Send keepalive messages every 30 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(`data: ${JSON.stringify({ type: "keepalive" })}\n\n`)
        } catch {
          // Connection closed, stop keepalive
          clearInterval(keepAlive)
        }
      }, 30000)

      // Clean up when connection closes
      request.signal.addEventListener("abort", () => {
        notificationEmitter.off("new", onNotification)
        clearInterval(keepAlive)
        try {
          controller.close()
        } catch {
          // Connection already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control",
    },
  })
}
