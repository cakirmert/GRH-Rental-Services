import { router, protectedProcedure } from "@/lib/trpcServer"
import { z } from "zod"
import { BookingStatus } from "@prisma/client"
import { TRPCError } from "@trpc/server"
import { bookingTransaction } from "@/server/bookingSecurity"
import { revokePasskey } from "@/lib/auth/passkey-store"
import { assertAccountHandover, deleteAccountData } from "@/server/accountDeletion"

export const userRouter = router({
  updateName: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { name: input.name },
        select: { id: true, name: true, email: true },
      })
    }),
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const role = ctx.session.user.role
    if (role !== "RENTAL" && role !== "ADMIN") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not allowed" })
    }
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { emailBookingNotifications: true },
    })
    return {
      emailBookingNotifications: user?.emailBookingNotifications ?? true,
    }
  }),
  updatePreferences: protectedProcedure
    .input(
      z.object({
        emailBookingNotifications: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const role = ctx.session.user.role
      if (role !== "RENTAL" && role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not allowed" })
      }
      if (typeof input.emailBookingNotifications === "undefined") {
        const current = await ctx.prisma.user.findUnique({
          where: { id: ctx.session.user.id },
          select: { emailBookingNotifications: true },
        })
        return {
          emailBookingNotifications: current?.emailBookingNotifications ?? true,
        }
      }

      const updated = await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { emailBookingNotifications: input.emailBookingNotifications },
        select: { emailBookingNotifications: true },
      })

      return {
        emailBookingNotifications: updated.emailBookingNotifications ?? true,
      }
    }),
  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id
    return bookingTransaction(ctx.prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, isSuperAdmin: true },
      })
      if (!user) throw new TRPCError({ code: "NOT_FOUND" })
      if (
        user.isSuperAdmin ||
        (user.role === "ADMIN" && (await tx.user.count({ where: { role: "ADMIN" } })) <= 1)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transfer administrative responsibility before deleting this account.",
        })
      }
      const activeBooking = await tx.booking.findFirst({
        where: {
          OR: [{ userId }, { assignedToId: userId }],
          status: { in: [BookingStatus.ACCEPTED, BookingStatus.BORROWED] },
        },
        select: { id: true },
      })
      if (activeBooking)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete account with active bookings.",
        })
      await assertAccountHandover(tx, userId)
      await deleteAccountData(tx, user)
      return { success: true }
    })
  }),
  selfDemote: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id
    return bookingTransaction(ctx.prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, isSuperAdmin: true },
      })
      if (!user || (user.role !== "ADMIN" && user.role !== "RENTAL")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is already not a staff member." })
      }
      if (
        user.isSuperAdmin ||
        (user.role === "ADMIN" && (await tx.user.count({ where: { role: "ADMIN" } })) <= 1)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transfer administrative responsibility before stepping down.",
        })
      }
      await assertAccountHandover(tx, userId)
      await tx.user.update({ where: { id: userId }, data: { role: "USER" } })
      return { success: true }
    })
  }),
  getPasskeys: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { passkeys: true },
    })

    if (!user || !user.passkeys) return []
    return (
      user.passkeys as Array<{
        credentialID: string
        publicKey: string
        counter: number
        createdAt?: string
        lastUsed?: string
        name?: string
      }>
    ).map((passkey, index) => ({
      id: passkey.credentialID,
      name: passkey.name || `Device ${index + 1}`,
      createdAt: passkey.createdAt ? new Date(passkey.createdAt) : new Date(),
      lastUsed: passkey.lastUsed ? new Date(passkey.lastUsed) : undefined,
    }))
  }),
  deletePasskey: protectedProcedure
    .input(z.object({ credentialId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await revokePasskey(ctx.session.user.id, input.credentialId)

      return { success: true }
    }),
})
