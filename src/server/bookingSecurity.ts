import { Prisma, type PrismaClient } from "@prisma/client"
import { TRPCError } from "@trpc/server"

/** Re-evaluate all eligibility and capacity predicates in one serializable snapshot. */
export async function bookingTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "The booking changed. Refresh and try again.",
      })
    }
    throw error
  }
}

// Legacy staff entries shared this column. Keep them hidden until the additive
// migration moves them to staffNotes; never expose that field to booking owners.
export function customerNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const marker = /(?:^|\n\n)Rental Team \(/.exec(notes)
  return marker ? notes.slice(0, marker.index).trimEnd() || null : notes
}

export function legacyStaffNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const marker = /(?:^|\n\n)Rental Team \(/.exec(notes)
  return marker ? notes.slice(marker.index).trimStart() : null
}

export function peakQuantity(
  bookings: Array<{ startDate: Date; endDate: Date; quantity: number }>,
) {
  const events = bookings
    .flatMap((booking) => [
      { time: booking.startDate.getTime(), delta: booking.quantity },
      { time: booking.endDate.getTime(), delta: -booking.quantity },
    ])
    .sort((a, b) => a.time - b.time || a.delta - b.delta)
  let current = 0
  let peak = 0
  for (const event of events) {
    current += event.delta
    peak = Math.max(peak, current)
  }
  return peak
}

export function ownerBooking<T extends { notes?: string | null; staffNotes?: string | null }>(
  booking: T,
) {
  const { staffNotes: _staffNotes, ...safe } = booking
  return { ...safe, notes: customerNotes(booking.notes) }
}

export function staffBooking<T extends { notes?: string | null; staffNotes?: string | null }>(
  booking: T,
) {
  return {
    ...booking,
    notes: [booking.notes, booking.staffNotes].filter(Boolean).join("\n\n") || null,
  }
}

export function assertDateRange(start: Date, end: Date, maximumDays: number) {
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    end.getTime() - start.getTime() > maximumDays * 86400000
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid date range (maximum ${maximumDays} days).`,
    })
  }
}
