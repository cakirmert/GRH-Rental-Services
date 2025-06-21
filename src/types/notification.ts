// ─ src/types/notification.ts ─────────────────────────────────

/**
 * Notification types for real-time notifications and SSE
 */

export interface NotificationData {
  id: string
  userId: string
  bookingId?: string
  type: string
  message: string
  read: boolean
  createdAt: string
}

export interface SSEMessage {
  type: "connected" | "notification" | "keepalive"
  data?: NotificationData
}

// Notification context types
export interface NotificationContextType {
  notifications: NotificationData[]
  unreadCount: number
  markAsRead: (notificationId: string) => void
  markAllAsRead: () => void
}
