// src/server/routers/admin.ts
import { router, protectedProcedure } from "@/lib/trpcServer"
import { z } from "zod"
import { ItemType, Role, BookingStatus } from "@prisma/client"
import path from "path"
import { v4 as uuidv4 } from "uuid"
import { put } from "@vercel/blob"
import { TRPCError } from "@trpc/server"
import type { Context } from "@/server/context"
import { logAction } from "@/lib/logger"
import { ADMIN_BLOCK_PREFIX } from "@/constants/booking"
import { normalizeEmail } from "@/utils/email"
import { revalidateTag } from "next/cache"
import { EQUIPMENT_CACHE_TAG } from "@/app/_data/equipment"

// Define LogType enum locally since it's not in Prisma schema
enum LogType {
  ADMIN = "ADMIN",
  USER = "USER",
  BOOKING = "BOOKING",
  SYSTEM = "SYSTEM",
}

function ensureAdmin(ctx: Context) {
  if (ctx.session?.user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" })
  }
}

export const adminRouter = router({
  // Dashboard statistics
  dashboardStats: protectedProcedure.query(async ({ ctx }) => {
    ensureAdmin(ctx)
    // Get total items count (only active items)
    const totalItems = await ctx.prisma.item.count({
      where: { active: true },
    })

    // Get team member count (RENTAL + ADMIN roles)
    const teamMemberCount = await ctx.prisma.user.count({
      where: { role: { in: [Role.RENTAL, Role.ADMIN] } },
    })

    // Get pending bookings count (REQUESTED status)
    const pendingBookings = await ctx.prisma.booking.count({
      where: {
        status: BookingStatus.REQUESTED,
        NOT: { notes: { startsWith: ADMIN_BLOCK_PREFIX } },
      },
    })

    const upcomingBookings = await ctx.prisma.booking.count({
      where: {
        startDate: { gte: new Date() },
        status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.BORROWED] },
        NOT: { notes: { startsWith: ADMIN_BLOCK_PREFIX } },
      },
    })

    return {
      totalItems,
      teamMemberCount,
      pendingBookings,
      upcomingBookings,
    }
  }),

  rentalTeamMembers: router({
    list: protectedProcedure.query(({ ctx }) => {
      ensureAdmin(ctx)
      return ctx.prisma.user.findMany({
        where: { role: { in: [Role.RENTAL, Role.ADMIN] } }, // Use Role enum
        select: { id: true, name: true, email: true },
      })
    }),
  }),

  itemsDefaults: router({
    list: protectedProcedure.query(({ ctx }) => {
      ensureAdmin(ctx)
      return ctx.prisma.item.findMany({
        include: { responsibleMembers: { select: { id: true, name: true, email: true } } },
      })
    }),
    update: protectedProcedure
      .input(z.object({ itemId: z.string(), memberIds: z.string().array() }))
      .mutation(async ({ ctx, input }) => {
        ensureAdmin(ctx)
        const result = await ctx.prisma.item.update({
          where: { id: input.itemId },
          data: { responsibleMembers: { set: input.memberIds.map((id) => ({ id })) } },
        })
        await revalidateTag(EQUIPMENT_CACHE_TAG)
        return result
      }),
  }),

  items: router({
    list: protectedProcedure.query(({ ctx }) => {
      ensureAdmin(ctx)
      return ctx.prisma.item.findMany({ orderBy: { createdAt: "desc" } })
    }),
    create: protectedProcedure
      .input(
        z.object({
          titleEn: z.string().min(1, "Title (EN) is required"),
          titleDe: z.string().optional(),
          descriptionEn: z.string().optional(),
          descriptionDe: z.string().optional(),
          rulesEn: z.string().optional(),
          rulesDe: z.string().optional(),
          type: z.nativeEnum(ItemType),
          capacity: z.number().int().optional(),
          players: z.string().optional(),
          totalQuantity: z.number().int().min(1),
          images: z.string().array().optional(),
          active: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        ensureAdmin(ctx)
        const { images, ...data } = input
        const created = await ctx.prisma.item.create({
          data: {
            ...data,
            imagesJson: images && images.length > 0 ? JSON.stringify(images) : undefined,
          },
        })
        await revalidateTag(EQUIPMENT_CACHE_TAG)
        await logAction({
          type: LogType.ADMIN,
          userId: ctx.session.user.id,
          message: `itemCreated:${created.id}`,
        })
        return created
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          titleEn: z.string().min(1, "Title (EN) is required"),
          titleDe: z.string().optional(),
          descriptionEn: z.string().optional(),
          descriptionDe: z.string().optional(),
          rulesEn: z.string().optional(),
          rulesDe: z.string().optional(),
          type: z.nativeEnum(ItemType),
          capacity: z.number().int().optional(),
          players: z.string().optional(),
          totalQuantity: z.number().int().min(1),
          images: z.string().array().optional(),
          active: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        ensureAdmin(ctx)
        const { id, images, ...data } = input
        const updated = await ctx.prisma.item.update({
          where: { id },
          data: {
            ...data,
            imagesJson: images ? JSON.stringify(images) : undefined,
          },
        })
        await revalidateTag(EQUIPMENT_CACHE_TAG)
        await logAction({
          type: LogType.ADMIN,
          userId: ctx.session.user.id,
          message: `itemUpdated:${id}`,
        })
        return updated
      }),
    toggle: protectedProcedure
      .input(z.object({ itemId: z.string(), isEnabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        ensureAdmin(ctx)
        const updated = await ctx.prisma.item.update({
          where: { id: input.itemId },
          data: { active: input.isEnabled },
        })
        await revalidateTag(EQUIPMENT_CACHE_TAG)
        await logAction({
          type: LogType.ADMIN,
          userId: ctx.session.user.id,
          message: `itemToggle:${input.itemId}:${input.isEnabled}`,
        })
        return updated
      }),
  }),

  memberManagement: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      ensureAdmin(ctx)
      return ctx.prisma.user.findMany({
        where: { role: { in: [Role.ADMIN, Role.RENTAL] } },
        select: { id: true, email: true, name: true, role: true },
        orderBy: { createdAt: "desc" },
      })
    }),
    getDetails: protectedProcedure
      .input(z.object({ userId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        ensureAdmin(ctx)
        const user = await ctx.prisma.user.findUnique({
          where: { id: input.userId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        })
        return user || null
      }),
    add: protectedProcedure
      .input(z.object({ email: z.string().email("Invalid email format") }))
      .mutation(async ({ ctx, input }) => {
        ensureAdmin(ctx)
        const normalizedEmail = normalizeEmail(input.email)
        const normalizedUser = await ctx.prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, email: true, name: true, role: true },
        })

        if (normalizedUser) {
          if (normalizedUser.role === Role.USER) {
            const updated = await ctx.prisma.user.update({
              where: { id: normalizedUser.id },
              data: { role: Role.RENTAL },
              select: { id: true, email: true, name: true, role: true },
            })
            await logAction({
              type: LogType.ADMIN,
              userId: ctx.session.user.id,
              message: `promoted:${updated.id}`,
            })
            return updated
          }
          return { ...normalizedUser, message: "User is already a rental team member or admin." }
        }

        const existingUser = await ctx.prisma.user.findFirst({
          where: { email: { equals: normalizedEmail, mode: "insensitive" } },
          select: { id: true, email: true, name: true, role: true },
        })

        if (existingUser) {
          if (existingUser.role === Role.USER) {
            const updated = await ctx.prisma.user.update({
              where: { id: existingUser.id },
              data: { role: Role.RENTAL, email: normalizedEmail },
              select: { id: true, email: true, name: true, role: true },
            })
            await logAction({
              type: LogType.ADMIN,
              userId: ctx.session.user.id,
              message: `promoted:${updated.id}`,
            })
            return updated
          }
          const updated = await ctx.prisma.user.update({
            where: { id: existingUser.id },
            data: { email: normalizedEmail },
            select: { id: true, email: true, name: true, role: true },
          })
          return { ...updated, message: "User is already a rental team member or admin." }
        }

        const created = await ctx.prisma.user.create({
          data: { email: normalizedEmail, role: Role.RENTAL },
          select: { id: true, email: true, name: true, role: true },
        })
        await logAction({
          type: LogType.ADMIN,
          userId: ctx.session.user.id,
          message: `added:${created.id}`,
        })
        return created
      }),
    remove: protectedProcedure
      .input(z.object({ userId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        ensureAdmin(ctx)
        const userToUpdate = await ctx.prisma.user.findUnique({ where: { id: input.userId } })
        if (!userToUpdate) throw new Error("User not found")
        if (userToUpdate.role === Role.ADMIN) throw new Error("Admins cannot be demoted this way.")
        const updated = await ctx.prisma.user.update({
          where: { id: input.userId },
          data: { role: Role.USER },
          select: { id: true, email: true, name: true, role: true },
        })
        await logAction({
          type: LogType.ADMIN,
          userId: ctx.session.user.id,
          message: `demoted:${updated.id}`,
        })
        return updated
      }),
  }),
  // Update the ordering and list of item images
  updateImages: protectedProcedure
    .input(z.object({ itemId: z.string(), images: z.string().array() }))
    .mutation(async ({ ctx, input }) => {
      ensureAdmin(ctx)
      const updated = await ctx.prisma.item.update({
        where: { id: input.itemId },
        data: { imagesJson: JSON.stringify(input.images) },
      })
      await revalidateTag(EQUIPMENT_CACHE_TAG)
      await logAction({
        type: LogType.ADMIN,
        userId: ctx.session.user.id,
        message: `imagesUpdated:${input.itemId}`,
      })
      return updated
    }),

  staffCancelledBookings: protectedProcedure.query(async ({ ctx }) => {
    ensureAdmin(ctx)
    const cutoffDate = new Date("2025-10-22T00:00:00.000Z")

    const bookings = await ctx.prisma.booking.findMany({
      where: {
        status: BookingStatus.CANCELLED,
        updatedAt: { gte: cutoffDate },
        NOT: { notes: { startsWith: ADMIN_BLOCK_PREFIX } },
      },
      include: {
        item: { select: { id: true, titleEn: true, titleDe: true, type: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { updatedAt: "desc" },
    })

    if (bookings.length === 0) return []

    const bookingIds = bookings.map((b) => b.id)

    const cancellationLogs = await ctx.prisma.log.findMany({
      where: {
        bookingId: { in: bookingIds },
        message: "status:CANCELLED",
      },
      orderBy: { createdAt: "desc" },
    })

    const latestCancellationLogByBooking = new Map<string, typeof cancellationLogs[number]>()
    for (const log of cancellationLogs) {
      if (log.bookingId && !latestCancellationLogByBooking.has(log.bookingId)) {
        latestCancellationLogByBooking.set(log.bookingId, log)
      }
    }

    const staffIds = Array.from(
      new Set(
        Array.from(latestCancellationLogByBooking.values())
          .map((log) => log.userId)
          .filter((id): id is string => Boolean(id)),
      ),
    )

    const staffMembers = staffIds.length
      ? await ctx.prisma.user.findMany({
          where: { id: { in: staffIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : []

    const staffById = new Map(staffMembers.map((staff) => [staff.id, staff]))
    const allowedRoles = new Set<Role>([Role.ADMIN, Role.RENTAL])

    return bookings
      .map((booking) => {
        const log = latestCancellationLogByBooking.get(booking.id)
        if (!log?.userId) return null
        const staff = staffById.get(log.userId)
        if (!staff || !allowedRoles.has(staff.role)) return null
        return {
          ...booking,
          cancelledBy: {
            id: staff.id,
            name: staff.name,
            email: staff.email,
            role: staff.role,
          },
          cancelledAt: log.createdAt,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  }),
})

export const uploadRouter = router({
  uploadItemImage: protectedProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileContentBase64: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const fileExtension = path.extname(input.fileName)
        const uniqueFileName = `items/${uuidv4()}${fileExtension}`
        const buffer = Buffer.from(input.fileContentBase64, "base64")
        const token = process.env.BLOB_READ_WRITE_TOKEN
        if (!token) throw new Error("Missing BLOB_READ_WRITE_TOKEN")
        const { url } = await put(uniqueFileName, buffer, {
          access: "public",
          token,
        })
        return { imageUrl: url }
      } catch (error) {
        console.error("Image upload failed:", error)
        throw new Error("Image upload failed. Please try again.")
      }
    }),
})
