"use client"

import { useState } from "react"
import type { AdminDashboardProps, AdminView } from "./types"

export function useAdminNavigation({
  section,
  onSectionChange,
  requestedReviewId,
  onReviewInactive,
}: Omit<AdminDashboardProps, "onGoBack">) {
  const [localSection, setLocalSection] = useState<AdminView>("home")
  const [localReviewId, setLocalReviewId] = useState<string>()
  const currentSection = section ?? localSection
  const navigate = (next: AdminView) => {
    setLocalReviewId(undefined)
    if (onSectionChange) onSectionChange(next)
    else setLocalSection(next)
  }
  const reviewInactive = (userId: string) => {
    if (onReviewInactive) onReviewInactive(userId)
    else {
      setLocalReviewId(userId)
      if (onSectionChange) onSectionChange("inactive")
      else setLocalSection("inactive")
    }
  }
  return {
    currentSection,
    requestedReviewId: requestedReviewId ?? localReviewId,
    navigate,
    reviewInactive,
  }
}
