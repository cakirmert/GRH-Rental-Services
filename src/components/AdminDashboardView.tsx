// src/components/AdminDashboardView.tsx
"use client"

import React, { useState } from "react"
import { useI18n } from "@/locales/i18n"
import { trpc } from "@/utils/trpc"
import { CalendarDays, XCircle, Hourglass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { ArrowLeft, Package, Users as UsersIcon, ListChecks } from "lucide-react"
import { useSession } from "next-auth/react"

import ProfilesTab from "./admin/ProfilesTab"
import ItemsTab from "./admin/ItemsTab"
import MembersTab from "./admin/MembersTab"
import CancelledByStaffTab from "./admin/CancelledByStaffTab"
import { CalendarProvider } from "./calendar/calendar-provider"
import { Calendar } from "./calendar/calendar"
import DashboardHelpSheet from "./DashboardHelpSheet"
import NotAuthorized from "./NotAuthorized"

/**
 * Available admin dashboard views/tabs
 */
export type AdminView = "home" | "assignees" | "items" | "members" | "calendar" | "cancellations"

// Helper component for visually appealing action cards on the homepage
function ActionCard({
  title,
  description,
  icon,
  onClick,
  disabled,
  id,
}: {
  title: string
  description: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  id?: string
}) {
  const clsx = (...args: (string | boolean | undefined)[]): string => {
    return args
      .filter(Boolean)
      .filter((arg): arg is string => typeof arg === "string")
      .join(" ")
  }

  return (
    <button
      id={id}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "bg-card border rounded-xl p-5 text-left hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200 ease-in-out group",
        "flex flex-col items-start h-full", // Ensure cards in a row have same height potential
        disabled && "opacity-50 cursor-not-allowed hover:shadow-none",
      )}
    >
      {icon}
      <h3 className="text-md font-semibold mb-1 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground flex-grow">
        {" "}
        {/* flex-grow for description */}
        {description}
      </p>
      {!disabled && (
        <span className="mt-3 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity pt-1 self-end">
          {/* Using self-end to push to bottom right */}
          Go to section →
        </span>
      )}
    </button>
  )
}

export default function AdminDashboardView({ onGoBack }: { onGoBack: () => void }) {
  const { t } = useI18n()
  const { data: session } = useSession()

  // Default to 'home' for the new homepage experience
  const [currentViewOrTab, setCurrentViewOrTab] = useState<AdminView>("home")

  // Check if user has admin role
  const isAdmin = session?.user?.role === "ADMIN"

  // Show not authorized page if user is not an admin
  if (!isAdmin) {
    return <NotAuthorized onGoBack={onGoBack} requiredRole="ADMIN" />
  }

  const handleNavigateToSection = (section: AdminView) => {
    setCurrentViewOrTab(section)
  }

  const handleBackToAdminHome = () => {
    setCurrentViewOrTab("home")
  }
  // Fetch real statistics from tRPC
  const {
    data: statsData,
    isLoading: isLoadingStats,
    error: statsError,
  } = trpc.admin.dashboardStats.useQuery(undefined, {
    refetchOnWindowFocus: false, // Optional: prevent refetching when window refocuses
  })

  const stats = {
    activeItemsSuffix: t("adminDashboard.home.activeItemsSuffix"),
    totalItems: statsData?.totalItems ?? 0,
    teamMemberCount: statsData?.teamMemberCount ?? 0,
    pendingBookings: statsData?.pendingBookings ?? 0,
    upcomingBookings: statsData?.upcomingBookings ?? 0,
  } // Home view - render the dashboard homepage with stats
  if (currentViewOrTab === "home") {
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
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
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
            <ActionCard
              id="admin-quick-items"
              title={t("adminDashboard.tabs.items")}
              description={t("adminDashboard.home.itemsDescription")}
              icon={<Package className="h-7 w-7 text-primary mb-2.5" />}
              onClick={() => handleNavigateToSection("items")}
            />
            <ActionCard
              id="admin-quick-members"
              title={t("adminDashboard.tabs.members")}
              description={t("adminDashboard.home.membersDescription")}
              icon={<UsersIcon className="h-7 w-7 text-primary mb-2.5" />}
              onClick={() => handleNavigateToSection("members")}
            />
            <ActionCard
              id="admin-quick-assignees"
              title={t("adminDashboard.tabs.defaults")}
              description={t("adminDashboard.home.assigneesDescription")}
              icon={<ListChecks className="h-7 w-7 text-primary mb-2.5" />}
              onClick={() => handleNavigateToSection("assignees")}
            />
            <ActionCard
              id="admin-quick-calendar"
              title={t("adminDashboard.home.calendar")}
              description={t("adminDashboard.home.calendarDescription")}
              icon={<CalendarDays className="h-7 w-7 text-primary mb-2.5" />}
              onClick={() => handleNavigateToSection("calendar")}
              disabled={false}
            />
            <ActionCard
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

  // If not on home, render the tabbed interface for the selected section
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6 p-4 md:p-6 lg:p-8 mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          {" "}
          {/* Reduced mb */}
          <Button variant="ghost" onClick={handleBackToAdminHome} className="text-sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.backToAdminHome")}
          </Button>
          {/* Main onGoBack button for exiting admin dashboard entirely */}
          <Button variant="outline" size="sm" onClick={onGoBack} className="text-sm">
            {t("common.exitAdmin")} <ArrowLeft className="ml-2 h-4 w-4 transform rotate-180" />{" "}
            {/* Example for exit */}
          </Button>
        </div>

        <Tabs
          value={currentViewOrTab}
          onValueChange={(value) => setCurrentViewOrTab(value as AdminView)}
          className="w-full"
        >
          <TabsList className="w-full flex flex-wrap gap-2 overflow-x-auto md:w-auto md:flex-nowrap md:gap-0 md:overflow-visible">
            <TabsTrigger
              value="assignees"
              className="flex-1 min-w-[140px] text-sm px-3 py-1.5 h-auto md:flex-none"
            >
              {" "}
              {/* Custom padding for smaller tabs */}
              <ListChecks className="mr-1.5 h-4 w-4" /> {t("adminDashboard.tabs.defaults")}
            </TabsTrigger>
            <TabsTrigger
              value="items"
              className="flex-1 min-w-[140px] text-sm px-3 py-1.5 h-auto md:flex-none"
            >
              <Package className="mr-1.5 h-4 w-4" /> {t("adminDashboard.tabs.items")}
            </TabsTrigger>
            <TabsTrigger
              value="members"
              className="flex-1 min-w-[140px] text-sm px-3 py-1.5 h-auto md:flex-none"
            >
              <UsersIcon className="mr-1.5 h-4 w-4" /> {t("adminDashboard.tabs.members")}
            </TabsTrigger>
            <TabsTrigger
              value="calendar"
              className="flex-1 min-w-[140px] text-sm px-3 py-1.5 h-auto md:flex-none"
            >
              <CalendarDays className="mr-1.5 h-4 w-4" /> {t("adminDashboard.tabs.calendar")}
            </TabsTrigger>
            <TabsTrigger
              value="cancellations"
              className="flex-1 min-w-[140px] text-sm px-3 py-1.5 h-auto md:flex-none"
            >
              <XCircle className="mr-1.5 h-4 w-4" /> {t("adminDashboard.tabs.cancellations")}
            </TabsTrigger>
          </TabsList>

          {/* Conditional rendering of tab content based on currentViewOrTab */}
          {currentViewOrTab === "assignees" && (
            <TabsContent
              value="assignees"
              className="mt-5 rounded-lg border bg-card text-card-foreground shadow"
            >
              <ProfilesTab />
            </TabsContent>
          )}
          {currentViewOrTab === "items" && (
            <TabsContent
              value="items"
              className="mt-5 rounded-lg border bg-card text-card-foreground shadow"
            >
              <ItemsTab />
            </TabsContent>
          )}
          {currentViewOrTab === "members" && (
            <TabsContent
              value="members"
              className="mt-5 rounded-lg border bg-card text-card-foreground shadow"
            >
              <MembersTab />
            </TabsContent>
          )}
          {currentViewOrTab === "calendar" && (
            <TabsContent
              value="calendar"
              className="mt-5 rounded-lg border bg-card text-card-foreground shadow"
            >
              {/* Placeholder for calendar content */}
              <div className="p-6">
                <CalendarProvider>
                  <Calendar />
                </CalendarProvider>
              </div>
            </TabsContent>
          )}
          {currentViewOrTab === "cancellations" && (
            <TabsContent
              value="cancellations"
              className="mt-5 rounded-lg border bg-card text-card-foreground shadow"
            >
              <CancelledByStaffTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </TooltipProvider>
  )
}
