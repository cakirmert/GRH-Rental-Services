import prisma from "@/lib/prismadb"
import { BookingStatus } from "@prisma/client"

/**
 * Automatically mark borrowed bookings as completed after a certain duration (e.g., 14 days).
 * This ensures that bookings don't stay in the BORROWED state indefinitely if not manually closed.
 */
export async function autoCompleteBorrowedBookings() {
    const twoWeeksAgo = new Date()
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

    const stalledBookings = await prisma.booking.findMany({
        where: {
            status: BookingStatus.BORROWED,
            updatedAt: {
                lte: twoWeeksAgo,
            },
        },
    })

    if (stalledBookings.length === 0) {
        return { count: 0 }
    }

    const result = await prisma.booking.updateMany({
        where: {
            id: {
                in: stalledBookings.map((b) => b.id),
            },
        },
        data: {
            status: BookingStatus.COMPLETED,
        },
    })

    return { count: result.count }
}
