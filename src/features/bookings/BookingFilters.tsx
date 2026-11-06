"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n } from "@/locales/i18n"
import { BookingStatus } from "@prisma/client"
import type { MyBookingsController } from "./useMyBookings"

export function BookingFilters({
  activeTab,
  setActiveTab,
  timeFilter,
  setTimeFilter,
}: Pick<MyBookingsController, "activeTab" | "setActiveTab" | "timeFilter" | "setTimeFilter">) {
  const { t } = useI18n()
  return (
    <div className="mb-6 space-y-3">
      <Tabs
        value={timeFilter}
        onValueChange={(value) => setTimeFilter(value as "upcoming" | "past")}
        className="w-full"
      >
        <TabsList className="grid w-full h-auto grid-cols-2">
          <TabsTrigger
            value="upcoming"
            className="min-h-10 min-w-0 whitespace-normal text-xs sm:text-sm px-2 sm:px-3 py-1.5 h-auto"
          >
            {t("myBookings.tabs.upcoming", { defaultValue: "Upcoming" })}
          </TabsTrigger>
          <TabsTrigger
            value="past"
            className="min-h-10 min-w-0 whitespace-normal text-xs sm:text-sm px-2 sm:px-3 py-1.5 h-auto"
          >
            {t("myBookings.tabs.past", { defaultValue: "Past" })}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as BookingStatus | "all")}
        className="w-full"
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-7">
          <TabsTrigger
            value="all"
            className="col-span-2 min-h-10 min-w-0 whitespace-normal text-xs sm:col-span-1 sm:text-sm px-2 py-1.5 h-auto"
          >
            {t("myBookings.tabs.all")}
          </TabsTrigger>
          {(Object.values(BookingStatus) as Array<BookingStatus>).map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="min-h-10 min-w-0 whitespace-normal text-xs sm:text-sm px-2 py-1.5 h-auto"
            >
              {t(`myBookings.tabs.${key.toLowerCase()}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
