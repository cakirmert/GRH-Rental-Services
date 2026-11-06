"use client"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"
import { ChevronLeft, RefreshCw, MessageSquare, AlertCircle as AlertCircleIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentAccount } from "@/features/identity/client"
import { Calendar } from "@/components/calendar/calendar"
import DashboardHelpSheet from "@/components/DashboardHelpSheet"
import NotAuthorized from "@/components/NotAuthorized"
import { Spinner } from "@/components/ui/spinner"
import type { StaffDashboardProps } from "./types"
import { useStaffBookings } from "./useStaffBookings"
import { StaffBookingCard } from "./StaffBookingCard"
import { StaffFilters } from "./StaffFilters"
import { StaffNotesDialog } from "./StaffNotesDialog"
import { StaffActionDialog } from "./StaffActionDialog"

export default function StaffDashboardFeature(props: StaffDashboardProps) {
  const { user, status } = useCurrentAccount()
  if (status === "loading") {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }
  if (status !== "authenticated" || !user || (user.role !== "RENTAL" && user.role !== "ADMIN")) {
    return <NotAuthorized onGoBack={props.onGoBack} requiredRole="RENTAL" />
  }
  return <StaffDashboard key={user.id} {...props} />
}
function StaffDashboard({ onGoBack, onOpenChat, ...options }: StaffDashboardProps) {
  const model = useStaffBookings(options)
  const { t, locale } = useI18n()
  const {
    bookings,
    viewMode,
    setViewMode,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = model
  return (
    <div className="space-y-6 p-1 sm:p-4 md:p-6 mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {t("header.rentalDashboardLink")}
        </h1>
        <div className="flex gap-2">
          <DashboardHelpSheet role="rental" />
          <Button
            variant="outline"
            size="sm"
            onClick={onGoBack}
            className="print:hidden flex items-center gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            {t("common.back")}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-sm sm:text-base">
        {t("rentalDashboard.description", {
          defaultValue: "Manage incoming booking requests and view the schedule.",
        })}
      </p>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Button
          id="rental-refresh-btn"
          onClick={() => refetch()}
          disabled={isLoading || isFetchingNextPage}
          size="sm"
          className="print:hidden self-start sm:self-center"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isLoading || isFetchingNextPage ? "animate-spin" : ""}`}
          />
          {t("rentalDashboard.refresh", { defaultValue: "Refresh" })}
        </Button>
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as "list" | "calendar")}
          className="w-full sm:w-fit mt-2 sm:mt-0"
        >
          <TabsList id="rental-view-tabs" className="grid w-full grid-cols-2">
            <TabsTrigger value="list">{locale === "de" ? "Liste" : "List"}</TabsTrigger>
            <TabsTrigger value="calendar">{t("header.rentalCalendarLink")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {viewMode === "list" && <StaffFilters {...model} />}
      {viewMode === "list" && (
        <>
          {isLoading && !bookings.length && (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-lg" />
              ))}
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertCircleIcon className="h-5 w-5" />
              <AlertTitle>{t("errors.title")}</AlertTitle>
              <AlertDescription>{error.message || t("errors.fetchBookings")}</AlertDescription>
            </Alert>
          )}
          {!isLoading && !error && bookings.length === 0 && (
            <Card className="text-center py-16 border-dashed">
              <CardContent className="flex flex-col items-center">
                <MessageSquare className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">
                  {t("rentalDashboard.noBookingsFound", {
                    defaultValue: "No bookings match your current filters.",
                  })}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("rentalDashboard.tryDifferentFilters", {
                    defaultValue: "Try adjusting your search or status filter.",
                  })}
                </p>
              </CardContent>
            </Card>
          )}

          {bookings.length > 0 && (
            <div id="rental-booking-list" className="space-y-4">
              {bookings.map((booking) => (
                <StaffBookingCard
                  key={booking.id}
                  booking={booking}
                  currentTimeMs={model.currentTimeMs}
                  onOpenChat={onOpenChat}
                  onNotes={model.openNotesDialog}
                  onAction={model.handleActionClick}
                />
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === "calendar" && <Calendar />}
      {viewMode === "list" && hasNextPage && (
        <div className="mt-6 text-center print:hidden">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage || isLoading}
            variant="outline"
            size="sm"
          >
            {isFetchingNextPage && <Spinner className="mr-2 size-4" />}
            {t("rentalDashboard.loadMore", { defaultValue: "Load More Bookings" })}
          </Button>
        </div>
      )}

      <StaffNotesDialog model={model} />
      <StaffActionDialog model={model} />
    </div>
  )
}
