"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useI18n } from "@/locales/i18n"
import { useSession } from "next-auth/react"
import TeamPortal from "./TeamPortal"
import NotAuthorized from "@/components/NotAuthorized"

interface TeamPortalPageProps {
  onGoBack: () => void
}

export default function TeamPortalPage({ onGoBack }: TeamPortalPageProps) {
  const { t } = useI18n()
  const { data: session } = useSession()
  const role = session?.user?.role
  const isStaff = role === "ADMIN" || role === "RENTAL"

  if (!isStaff) {
    return <NotAuthorized onGoBack={onGoBack} requiredRole="RENTAL" />
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Team Portal</h1>
        <Button variant="outline" size="sm" onClick={onGoBack} className="text-sm">
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back")}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm sm:text-base">
        Vote on admin role changes and chat with the team.
      </p>
      <TeamPortal />
    </div>
  )
}
