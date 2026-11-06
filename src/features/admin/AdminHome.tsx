"use client"

import { useI18n } from "@/locales/i18n"
import { trpc } from "@/utils/trpc"
import { CalendarDays, XCircle, Hourglass, Clock3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { ArrowLeft, Package, Users as UsersIcon, ListChecks } from "lucide-react"
import { retentionCopy } from "@/locales/retention"
import DashboardHelpSheet from "@/components/DashboardHelpSheet"
import type { AdminDashboardProps, AdminView } from "./types"
import { AdminActionCard } from "./AdminActionCard"

export function AdminHome({
  onGoBack,
  onSectionChange: handleNavigateToSection,
}: Pick<AdminDashboardProps, "onGoBack"> & { onSectionChange: (section: AdminView) => void }) {
  const { t, locale } = useI18n()
  const {
    data: statsData,
    isLoading: isLoadingStats,
    error: statsError,
    refetch,
  } = trpc.admin.dashboardStats.useQuery(undefined, { refetchOnWindowFocus: false })
  const stats = {
    activeItemsSuffix: t("adminDashboard.home.activeItemsSuffix"),
    totalItems: statsData?.totalItems ?? 0,
    teamMemberCount: statsData?.teamMemberCount ?? 0,
    pendingBookings: statsData?.pendingBookings ?? 0,
    upcomingBookings: statsData?.upcomingBookings ?? 0,
  }
  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8 mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          {t("adminDashboard.home.title")}
        </h1>
        <div className="flex gap-2">
          <DashboardHelpSheet role="admin" />
          <Button variant="outline" size="sm" onClick={onGoBack} className="text-sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back")}
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-base md:text-lg">
        {t("adminDashboard.home.welcomeSubtitle")}
      </p>

      {/* Stats Section */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Statistics
        </h2>
        <div
          id="admin-dashboard-stats"
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {isLoadingStats ? (
            // Loading skeleton cards
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border bg-card p-5">
                  <div className="h-4 bg-muted rounded-full mb-2.5"></div>
                  <div className="h-10 bg-primary rounded-full"></div>
                </div>
              ))}
            </>
          ) : statsError ? (
            // Error state
            <Card className="md:col-span-2 lg:col-span-3 xl:col-span-4">
              <CardContent className="flex items-center justify-center py-8">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">
                    {t("errors.fetchStats", { defaultValue: "Failed to load statistics" })}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => void refetch()}>
                    {t("common.retry", { defaultValue: "Retry" })}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            // Stats cards with real data
            <>
              {/* Active Items Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t("adminDashboard.stats.activeItems", { defaultValue: "Active Items" })}
                  </CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalItems}</div>
                  <p className="text-xs text-muted-foreground">{stats.activeItemsSuffix}</p>
                </CardContent>
              </Card>

              {/* Team Members Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t("adminDashboard.stats.teamMembers", { defaultValue: "Team Members" })}
                  </CardTitle>
                  <UsersIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.teamMemberCount}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("adminDashboard.stats.teamMembersSuffix", {
                      defaultValue: "rental + admin",
                    })}
                  </p>
                </CardContent>
              </Card>

              {/* Pending Bookings Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t("adminDashboard.stats.pendingBookings", {
                      defaultValue: "Pending Bookings",
                    })}
                  </CardTitle>
                  <Hourglass className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.pendingBookings}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("adminDashboard.stats.pendingBookingsSuffix", {
                      defaultValue: "awaiting review",
                    })}
                  </p>
                </CardContent>
              </Card>
              {/* Upcoming Bookings Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t("adminDashboard.stats.upcomingBookings", {
                      defaultValue: "Upcoming Bookings",
                    })}
                  </CardTitle>
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.upcomingBookings}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("adminDashboard.stats.upcomingBookingsSuffix", {
                      defaultValue: "within future dates",
                    })}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </section>

      {/* Quick Actions Section */}
      <section aria-labelledby="actions-heading" className="pt-4">
        <h2 id="actions-heading" className="text-xl font-semibold mb-4">
          {t("adminDashboard.home.quickActions")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AdminActionCard
            id="admin-quick-items"
            title={t("adminDashboard.tabs.items")}
            description={t("adminDashboard.home.itemsDescription")}
            icon={<Package className="h-7 w-7 text-primary mb-2.5" />}
            onClick={() => handleNavigateToSection("items")}
          />
          <AdminActionCard
            id="admin-quick-members"
            title={t("adminDashboard.tabs.members")}
            description={t("adminDashboard.home.membersDescription")}
            icon={<UsersIcon className="h-7 w-7 text-primary mb-2.5" />}
            onClick={() => handleNavigateToSection("members")}
          />
          <AdminActionCard
            id="admin-quick-inactive"
            title={retentionCopy[locale].title}
            description={retentionCopy[locale].shortcut}
            icon={<Clock3 aria-hidden="true" className="h-7 w-7 text-primary mb-2.5" />}
            onClick={() => handleNavigateToSection("inactive")}
          />
          <AdminActionCard
            id="admin-quick-assignees"
            title={t("adminDashboard.tabs.defaults")}
            description={t("adminDashboard.home.assigneesDescription")}
            icon={<ListChecks className="h-7 w-7 text-primary mb-2.5" />}
            onClick={() => handleNavigateToSection("assignees")}
          />
          <AdminActionCard
            id="admin-quick-calendar"
            title={t("adminDashboard.home.calendar")}
            description={t("adminDashboard.home.calendarDescription")}
            icon={<CalendarDays className="h-7 w-7 text-primary mb-2.5" />}
            onClick={() => handleNavigateToSection("calendar")}
            disabled={false}
          />
          <AdminActionCard
            id="admin-quick-cancellations"
            title={t("adminDashboard.home.cancellations")}
            description={t("adminDashboard.home.cancellationsDescription")}
            icon={<XCircle className="h-7 w-7 text-primary mb-2.5" />}
            onClick={() => handleNavigateToSection("cancellations")}
          />
        </div>
      </section>
    </div>
  )
}
