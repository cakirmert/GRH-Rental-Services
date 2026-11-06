import { router, protectedProcedure, publicProcedure } from "@/lib/trpcServer"
import { invoke, invokePublic } from "@/server/modules/shared/trpcAdapter"
import * as inputs from "@/server/modules/bookings/contracts"
import * as queries from "@/server/modules/bookings/queries"
import * as commands from "@/server/modules/bookings/commands"
import * as availability from "@/server/modules/bookings/availability"
import type { Prisma, ItemType } from "@prisma/client"

export const bookingsRouter = router({
  list: protectedProcedure
    .input(inputs.listBookingsInput)
    .query(({ ctx, input }) => invoke(ctx, (context) => queries.listBookings(context, input))),

  create: protectedProcedure
    .input(inputs.createBookingInput)
    .mutation(({ ctx, input }) => invoke(ctx, (context) => commands.createBooking(context, input))),

  // User updating their own booking
  update: protectedProcedure
    .input(inputs.updateBookingInput)
    .mutation(({ ctx, input }) => invoke(ctx, (context) => commands.updateBooking(context, input))),

  cancel: protectedProcedure
    .input(inputs.cancelBookingInput)
    .mutation(({ ctx, input }) => invoke(ctx, (context) => commands.cancelBooking(context, input))),

  // listForRentalTeam - (already good, minor type safety from Prisma)
  listForRentalTeam: protectedProcedure
    .input(inputs.listTeamBookingsInput)
    .query(({ ctx, input }) => invoke(ctx, (context) => queries.listTeamBookings(context, input))),

  addRentalNote: protectedProcedure
    .input(inputs.addStaffNoteInput)
    .mutation(({ ctx, input }) => invoke(ctx, (context) => commands.addStaffNote(context, input))),

  // updateBookingStatusByTeam - (already good, minor type safety)
  updateBookingStatusByTeam: protectedProcedure
    .input(inputs.transitionBookingInput)
    .mutation(({ ctx, input }) =>
      invoke(ctx, (context) => commands.transitionBooking(context, input)),
    ),

  blockableItems: protectedProcedure.query(({ ctx }) =>
    invoke(ctx, (context) => availability.listBlockableItems(context)),
  ),

  blockSlots: protectedProcedure
    .input(inputs.createAvailabilityBlockInput)
    .mutation(({ ctx, input }) =>
      invoke(ctx, (context) => availability.createAvailabilityBlock(context, input)),
    ),

  cancelBlockOccurrence: protectedProcedure
    .input(inputs.cancelBlockOccurrenceInput)
    .mutation(({ ctx, input }) =>
      invoke(ctx, (context) => availability.cancelBlockOccurrence(context, input)),
    ),

  stopBlockSeries: protectedProcedure
    .input(inputs.stopBlockSeriesInput)
    .mutation(({ ctx, input }) =>
      invoke(ctx, (context) => availability.stopBlockSeries(context, input)),
    ),

  listForRentalCalendar: protectedProcedure
    .input(inputs.listRentalCalendarInput)
    .query(({ ctx, input }) =>
      invoke(ctx, (context) => queries.listRentalCalendar(context, input)),
    ),

  getBookings: protectedProcedure
    .input(inputs.getCalendarBookingsInput)
    .query(({ ctx, input }) =>
      invoke(ctx, (context) => queries.getCalendarBookings(context, input)),
    ),

  availability: publicProcedure
    .input(inputs.getAvailabilityInput)
    .query(({ ctx, input }) =>
      invokePublic(ctx, (context) => availability.getAvailability(context, input)),
    ),
})

// Updated type export to use correct Item fields
export type BookingForRentalTeam = Omit<
  Prisma.BookingGetPayload<{
    include: {
      item: { select: { id: true; titleEn: true; titleDe: true; type: true; totalQuantity: true } }
      user: { select: { id: true; name: true; email: true } }
      assignedTo: { select: { id: true; name: true; email: true } }
    }
  }>,
  "item"
> & {
  item: {
    id: string
    titleEn: string
    titleDe: string | null
    type: ItemType | null
    totalQuantity: number
  } | null
}

export type CalendarBooking = Omit<
  Prisma.BookingGetPayload<{
    include: {
      item: { select: { id: true; titleEn: true; titleDe: true; type: true; totalQuantity: true } }
      user: { select: { id: true; name: true; email: true } }
    }
  }>,
  "item"
> & {
  item: {
    id: string
    titleEn: string
    titleDe: string | null
    type: ItemType | null
    totalQuantity: number
  } | null
}
