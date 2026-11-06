import { z } from "zod"

import { BookingStatus } from "@prisma/client"

export const listBookingsInput = z.object({
  status: z.nativeEnum(BookingStatus).optional(),
  all: z.boolean().optional(),
})
export type ListBookingsInput = z.output<typeof listBookingsInput>

export const createBookingInput = z.object({
  itemId: z.string(),
  quantity: z.number().int().min(1).default(1),
  start: z.string(), // ISO string
  end: z.string(), // ISO string
  notes: z.string().max(5000).optional(),
})
export type CreateBookingInput = z.output<typeof createBookingInput>

export const updateBookingInput = z.object({
  id: z.string(),
  start: z.string(), // ISO string
  end: z.string(), // ISO string
  notes: z.string().max(5000).optional(),
})
export type UpdateBookingInput = z.output<typeof updateBookingInput>

export const cancelBookingInput = z.object({ id: z.string() })
export type CancelBookingInput = z.output<typeof cancelBookingInput>

export const listTeamBookingsInput = z.object({
  status: z.nativeEnum(BookingStatus).optional(),
  searchTerm: z.string().optional(),
  limit: z.number().min(1).max(100).nullish().default(25),
  cursor: z.string().nullish(),
})
export type ListTeamBookingsInput = z.output<typeof listTeamBookingsInput>

export const addStaffNoteInput = z.object({
  bookingId: z.string(),
  note: z.string().max(5000),
})
export type AddStaffNoteInput = z.output<typeof addStaffNoteInput>

export const transitionBookingInput = z.object({
  bookingId: z.string(),
  newStatus: z.nativeEnum(BookingStatus),
})
export type TransitionBookingInput = z.output<typeof transitionBookingInput>

export const createAvailabilityBlockInput = z.object({
  itemId: z.string().min(1).max(200),
  start: z.string().datetime(),
  end: z.string().datetime(),
  quantity: z.number().int().min(1).optional(),
  reason: z.string().max(500).optional(),
  recurrence: z
    .object({
      frequency: z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]).default("NONE"),
      until: z.string().datetime().optional(),
    })
    .optional(),
})
export type CreateAvailabilityBlockInput = z.output<typeof createAvailabilityBlockInput>

export const cancelBlockOccurrenceInput = z.object({
  recurringBlockId: z.string().min(1).max(200),
  occurrenceStart: z.string().datetime(),
})
export type CancelBlockOccurrenceInput = z.output<typeof cancelBlockOccurrenceInput>

export const stopBlockSeriesInput = z.object({
  recurringBlockId: z.string().min(1).max(200),
  occurrenceStart: z.string().datetime(),
})
export type StopBlockSeriesInput = z.output<typeof stopBlockSeriesInput>

export const listRentalCalendarInput = z.object({
  from: z.string(),
  to: z.string(),
})
export type ListRentalCalendarInput = z.output<typeof listRentalCalendarInput>

export const getCalendarBookingsInput = z.object({
  start: z.date(),
  end: z.date(),
})
export type GetCalendarBookingsInput = z.output<typeof getCalendarBookingsInput>

export const getAvailabilityInput = z.object({
  itemId: z.string(),
  from: z.string(),
  to: z.string(),
})
export type GetAvailabilityInput = z.output<typeof getAvailabilityInput>
