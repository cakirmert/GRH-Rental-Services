"use client"

import { useI18n } from "@/locales/i18n"
import { CalendarDays, XCircle, Clock3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ArrowLeft, Package, Users as UsersIcon, ListChecks } from "lucide-react"
import ProfilesTab from "@/components/admin/ProfilesTab"
import ItemsTab from "@/components/admin/ItemsTab"
import MembersTab from "@/components/admin/MembersTab"
import InactiveAccountsTab from "@/components/admin/InactiveAccountsTab"
import { retentionCopy } from "@/locales/retention"
import CancelledByStaffTab from "@/components/admin/CancelledByStaffTab"
import { Calendar } from "@/components/calendar/calendar"
import type { AdminView } from "./types"

export function AdminWorkspace({
  actorId,
  currentViewOrTab,
  requestedReviewId,
  handleNavigateToSection,
  onReviewInactive,
  onGoBack,
}: {
  actorId: string
  currentViewOrTab: AdminView
  requestedReviewId?: string
  handleNavigateToSection: (section: AdminView) => void
  onReviewInactive: (userId: string) => void
  onGoBack: () => void
}) {
  const { t, locale } = useI18n()
  const handleBackToAdminHome = () => handleNavigateToSection("home")
  // If not on home, render the tabbed interface for the selected section
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6 p-4 md:p-6 lg:p-8 mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          {" "}
          <Button variant="ghost" onClick={handleBackToAdminHome} className="text-sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.backToAdminHome")}
          </Button>
          {/* Main onGoBack button for exiting admin dashboard entirely */}
          <Button variant="outline" size="sm" onClick={onGoBack} className="text-sm">
            {t("common.exitAdmin")} <ArrowLeft className="ml-2 h-4 w-4 transform rotate-180" />{" "}
          </Button>
        </div>

        <Tabs
          value={currentViewOrTab}
          onValueChange={(value) => handleNavigateToSection(value as AdminView)}
          className="w-full"
        >
          <TabsList className="h-auto w-full flex flex-wrap gap-2 md:w-auto md:gap-0">
            <TabsTrigger
              value="assignees"
              className="flex-1 min-w-[140px] text-sm px-3 py-1.5 h-auto md:flex-none"
            >
              {" "}
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
              value="inactive"
              className="flex-1 min-w-[140px] text-sm px-3 py-1.5 h-auto md:flex-none"
            >
              <Clock3 aria-hidden="true" className="mr-1.5 h-4 w-4" /> {retentionCopy[locale].title}
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
              <MembersTab onReviewInactive={onReviewInactive} />
            </TabsContent>
          )}
          {currentViewOrTab === "calendar" && (
            <TabsContent
              value="calendar"
              className="mt-5 rounded-lg border bg-card text-card-foreground shadow"
            >
              <div className="p-6">
                <Calendar />
              </div>
            </TabsContent>
          )}
          {currentViewOrTab === "inactive" && (
            <TabsContent
              value="inactive"
              className="mt-5 rounded-lg border bg-card text-card-foreground shadow"
            >
              <InactiveAccountsTab
                key={`${actorId}:${requestedReviewId ?? "all"}`}
                requestedReviewId={requestedReviewId}
                onShowAll={() => handleNavigateToSection("inactive")}
              />
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
