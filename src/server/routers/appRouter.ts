import { router } from "@/lib/trpcServer"
import { itemsRouter } from "./itemRouter"
import { bookingsRouter } from "./bookingRouter"
import { adminRouter, uploadRouter } from "./adminRouter"
import { chatRouter } from "./chatRouter"
import { userRouter } from "./userRouter"
import { notificationsRouter } from "./notificationRouter"
import { webauthnRouter } from "./webauthnRouter"
import { authRouter } from "./authRouter"

export const appRouter = router({
  items: itemsRouter,
  bookings: bookingsRouter,
  admin: adminRouter,
  upload: uploadRouter,
  chat: chatRouter,
  user: userRouter,
  notifications: notificationsRouter,
  webauthn: webauthnRouter,
  auth: authRouter,
})

export type AppRouter = typeof appRouter
