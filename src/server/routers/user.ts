import { router, protectedProcedure } from "@/lib/trpcServer"
import { z } from "zod"
import { BookingStatus } from "@prisma/client"
import { TRPCError } from "@trpc/server"

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

    const activeBooking = await ctx.prisma.booking.findFirst({
      where: {
        userId,
        status: { in: [BookingStatus.ACCEPTED, BookingStatus.BORROWED] },
      },
      select: { id: true },
    })

    if (activeBooking) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot delete account with active bookings.",
      })
    }

    // Capture the role before deleting
    const userRole = ctx.session.user.role

    await ctx.prisma.booking.deleteMany({ where: { userId } })
    await ctx.prisma.user.delete({ where: { id: userId } })

    // Auto-admin logic: if the user was staff, check if we need to promote the last remaining staff member
    if (userRole === "ADMIN" || userRole === "RENTAL") {
      const remainingStaff = await ctx.prisma.user.findMany({
        where: { role: { in: ["ADMIN", "RENTAL"] } }
      })
      if (remainingStaff.length === 1 && remainingStaff[0].role !== "ADMIN") {
        await ctx.prisma.user.update({
          where: { id: remainingStaff[0].id },
          data: { role: "ADMIN" }
        })
      }
    }

    return { success: true }
  }),
  selfDemote: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const userRole = ctx.session.user.role

    if (userRole !== "ADMIN" && userRole !== "RENTAL") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "User is already not a staff member." })
    }

    if (userRole === "ADMIN") {
      // Check if this is the last admin
      const adminCount = await ctx.prisma.user.count({ where: { role: "ADMIN" } })
      if (adminCount <= 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You are the last active Admin. You cannot step down unless you delete your account." })
      }
    }

    await ctx.prisma.user.update({
      where: { id: userId },
      data: { role: "USER" }
    })

    // Re-check auto-admin logic if the demoted user was RENTAL and leaves only 1 RENTAL left.
    // Wait, the logic is: if total staff drops to exactly 1, promote them to ADMIN.
    const remainingStaff = await ctx.prisma.user.findMany({
      where: { role: { in: ["ADMIN", "RENTAL"] } }
    })

    if (remainingStaff.length === 1 && remainingStaff[0].role !== "ADMIN") {
      await ctx.prisma.user.update({
        where: { id: remainingStaff[0].id },
        data: { role: "ADMIN" }
      })
    }

    return { success: true }
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
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { passkeys: true },
      })

      if (!user || !user.passkeys) {
        throw new Error("No passkeys found")
      }

      const passkeys = user.passkeys as Array<{
        credentialID: string
        publicKey: string
        counter: number
      }>

      const updatedPasskeys = passkeys.filter((p) => p.credentialID !== input.credentialId)

      if (updatedPasskeys.length === passkeys.length) {
        throw new Error("Passkey not found")
      }

      await ctx.prisma.user.update({
        where: { id: ctx.session.user.id },
        data: { passkeys: updatedPasskeys },
      })

      return { success: true }
    }),
})
