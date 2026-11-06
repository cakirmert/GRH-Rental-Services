"use client"

import { Info, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { MyBookingsFeatureProps } from "./types"
import { useMyBookings } from "./useMyBookings"
import { useBookingPresentation } from "./useBookingPresentation"
import { BookingCard } from "./BookingCard"
import { BookingFilters } from "./BookingFilters"
import { BookingDetailsDialog } from "./BookingDetailsDialog"
import { BookingEditDialog } from "./BookingEditDialog"
import { BookingCancelDialog } from "./BookingCancelDialog"
import { useCurrentAccount } from "@/features/identity/client"

export default function MyBookingsFeature(props: MyBookingsFeatureProps) {
  const { user } = useCurrentAccount()
  return <MyBookingsScreen key={user?.id ?? "guest"} {...props} />
}

function MyBookingsScreen({ onOpenChat, ...props }: MyBookingsFeatureProps) {
  const model = useMyBookings(props)
  const { onGoBackToList } = props
  const { t, formatStatusDisplay } = useBookingPresentation()
  const {
    sessionStatus,
    isLoading,
    activeTab,
    timeFilter,
    filteredBookingsToDisplay,
    activeHighlightId,
    highlightedBookingRef,
  } = model
  if (isLoading || sessionStatus === "loading") {
    return (
      <div className="w-full mx-auto py-8 px-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <Skeleton className="h-10 w-48 rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
        </div>
        <Skeleton className="h-10 w-full mb-6 rounded-md" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-48 w-full mb-4 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="w-full mx-auto py-8 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("myBookings.title")}</h1>
        <Button variant="outline" onClick={onGoBackToList} size="sm">
          <ChevronLeft className="mr-2 h-4 w-4" />
          {t("myBookings.browseItemsButton")}
        </Button>
      </div>

      <BookingFilters {...model} />
      {filteredBookingsToDisplay.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center min-h-[250px]">
            <Info className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground mb-2">
              {activeTab !== "all"
                ? t("myBookings.noBookingsFound", {
                    status: formatStatusDisplay(activeTab),
                  })
                : t(
                    timeFilter === "past"
                      ? "myBookings.noPastBookings"
                      : "myBookings.noUpcomingBookings",
                  )}
            </p>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              {t("myBookings.noBookingsFoundDesc", {
                defaultValue:
                  "It looks like you don't have any bookings with this status yet. Why not explore some items?",
              })}
            </p>
            <Button variant="default" onClick={onGoBackToList}>
              {t("myBookings.browseItemsButton")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredBookingsToDisplay.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              highlightRef={booking.id === activeHighlightId ? highlightedBookingRef : undefined}
              onDetails={(item) => {
                model.setSelectedBooking(item)
                model.setShowDetails(true)
              }}
              onEdit={model.prepareEditForm}
              onCancel={(item) => {
                model.setSelectedBooking(item)
                model.setShowCancelDialog(true)
              }}
              onOpenChat={onOpenChat}
              onGoBackToList={onGoBackToList}
            />
          ))}
        </div>
      )}

      <BookingDetailsDialog model={model} />
      <BookingEditDialog model={model} />
      <BookingCancelDialog model={model} />
    </div>
  )
}
