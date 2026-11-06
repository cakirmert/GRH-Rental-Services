"use client"

import { useI18n } from "@/locales/i18n"
import { BookingStatus } from "@prisma/client"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { StaffBookingsController } from "./useStaffBookings"

export function StaffFilters({
  searchTermInput,
  setSearchTermInput,
  statusFilter,
  setStatusFilter,
}: Pick<
  StaffBookingsController,
  "searchTermInput" | "setSearchTermInput" | "statusFilter" | "setStatusFilter"
>) {
  const { t } = useI18n()
  return (
    <Card id="rental-filter-card" className="print:hidden shadow-sm">
      <CardContent className="p-4 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
        <div className="flex-grow sm:flex-1 min-w-[200px]">
          <Label htmlFor="dashboard-search" className="text-xs font-medium">
            {t("rentalDashboard.searchLabel", { defaultValue: "Search bookings" })}
          </Label>
          <Input
            id="dashboard-search"
            type="text"
            placeholder={t("rentalDashboard.searchPlaceholder", {
              defaultValue: "Item, user name/email...",
            })}
            value={searchTermInput}
            onChange={(e) => setSearchTermInput(e.target.value)}
            className="h-9 mt-1"
          />
        </div>
        <div className="flex-grow sm:flex-none sm:w-auto min-w-[180px]">
          <Label htmlFor="status-filter" className="text-xs font-medium">
            {t("rentalDashboard.statusFilterLabel", { defaultValue: "Filter by Status" })}
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as BookingStatus | "ALL_ACTIVE")}
          >
            <SelectTrigger id="status-filter" className="h-9 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL_ACTIVE">
                {t("rentalDashboard.statusAllActive", { defaultValue: "All Active (Default)" })}
              </SelectItem>
              {Object.values(BookingStatus).map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`myBookings.tabs.${status.toLowerCase()}`, { defaultValue: status })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
