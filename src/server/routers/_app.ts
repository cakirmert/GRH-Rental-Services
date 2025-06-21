// src/server/routers/_app.ts
import { router } from "@/lib/trpcServer"
import { itemsRouter } from "./items"
import { bookingsRouter } from "./bookings"
import { adminRouter } from "./admin"
import { uploadRouter } from "./admin"
import { chatRouter } from "./chat"
import { userRouter } from "./user"
import { notificationsRouter } from "./notifications"
import { webauthnRouter } from "./webauthn"
import { authRouter } from "./auth"

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
