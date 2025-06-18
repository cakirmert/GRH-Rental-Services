import EventEmitter from "events"

class NotificationEmitter extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(500) // Increase max listeners for development
  }
}

// Use singleton pattern to ensure same instance across the app
const globalForNotifications = globalThis as unknown as {
  notificationEmitter: NotificationEmitter | undefined
}

export const notificationEmitter =
  globalForNotifications.notificationEmitter ?? new NotificationEmitter()

if (process.env.NODE_ENV !== "production") {
  globalForNotifications.notificationEmitter = notificationEmitter
}
