import { router, protectedProcedure } from "@/server/trpcServer"
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

    await ctx.prisma.booking.deleteMany({ where: { userId } })
    await ctx.prisma.user.delete({ where: { id: userId } })
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
