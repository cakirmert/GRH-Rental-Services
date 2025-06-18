// src/components/admin/ProfilesTab.tsx
"use client"

import React, { useState, useMemo, useEffect, useCallback } from "react"
import clsx from "clsx"
import { ItemType } from "@prisma/client"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"

import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/server/routers/_app"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Loader2, User, Info, Pencil, Save, RotateCcw, Users as UsersIcon } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

type RouterOutput = inferRouterOutputs<AppRouter>
type ItemWithDefaults = RouterOutput["admin"]["itemsDefaults"]["list"][number]
type MemberInDefaultList = ItemWithDefaults["responsibleMembers"][number]

const useItemTypeLabels = () => {
  const { t } = useI18n()
  return (type: ItemType | undefined | null): string => {
    if (!type) return ""
    switch (type) {
      case ItemType.ROOM:
        return t("common.room")
      case ItemType.SPORTS:
        return t("common.sports")
      case ItemType.GAME:
        return t("common.game")
      case ItemType.OTHER:
        return t("common.other")
      default:
        return type
    }
  }
}

export default function ProfilesTab() {
  const { t, locale } = useI18n()
  const utils = trpc.useContext()
  const getItemTypeLabel = useItemTypeLabels()

  const { data: members = [], isLoading: isLoadingMembersFallback } =
    trpc.admin.rentalTeamMembers.list.useQuery(undefined, { initialData: [] })
  const { data: allItemsDefaults = [], isLoading: isLoadingItemsDefaultsFallback } =
    trpc.admin.itemsDefaults.list.useQuery(undefined, { initialData: [] })

  const isLoadingMembers = isLoadingMembersFallback && members.length === 0
  const isLoadingItemsDefaults = isLoadingItemsDefaultsFallback && allItemsDefaults.length === 0

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (members.length > 0 && !selectedMemberId) {
      setSelectedMemberId(members[0].id)
    }
  }, [members, selectedMemberId])

  useEffect(() => {
    setPendingAssignments({})
  }, [selectedMemberId])

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId),
    [members, selectedMemberId],
  )

  const updateAssignment = trpc.admin.itemsDefaults.update.useMutation({
    onError: (error) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" })
    },
  })

  const handleTogglePendingAssignment = (itemId: string, assignToCurrentMember: boolean) => {
    if (!selectedMemberId) return
    setPendingAssignments((prev) => ({ ...prev, [itemId]: assignToCurrentMember }))
  }

  const handleBatchTogglePendingAssignment = (itemType: ItemType, assignAll: boolean) => {
    if (!selectedMemberId) return
    const itemsOfType = itemsGroupedByType[itemType]
    if (!itemsOfType) return

    const newPendingForType: Record<string, boolean> = {}
    itemsOfType.forEach((item) => {
      newPendingForType[item.id] = assignAll
    })
    setPendingAssignments((prev) => ({ ...prev, ...newPendingForType }))
  }

  const discardPendingChanges = () => {
    setPendingAssignments({})
    toast({ title: t("adminDashboard.defaults.changesDiscarded"), duration: 2000 })
  }
  const calculateDbChanges = useCallback((): Array<{ itemId: string; memberIds: string[] }> => {
    if (!selectedMemberId) return []

    const dbOperations: Array<{ itemId: string; memberIds: string[] }> = []
    allItemsDefaults.forEach((item) => {
      const desiredAssignmentState = pendingAssignments[item.id]

      if (typeof desiredAssignmentState === "boolean") {
        const originalMemberIdsSet = new Set(
          item.responsibleMembers.map((m: MemberInDefaultList) => m.id),
        )
        const finalMemberIdsSet = new Set(originalMemberIdsSet)

        if (desiredAssignmentState === true) {
          finalMemberIdsSet.add(selectedMemberId)
        } else {
          finalMemberIdsSet.delete(selectedMemberId)
        }

        let hasActualChange = originalMemberIdsSet.size !== finalMemberIdsSet.size
        if (!hasActualChange) {
          for (const id of originalMemberIdsSet) {
            if (!finalMemberIdsSet.has(id)) {
              hasActualChange = true
              break
            }
          }
          if (!hasActualChange) {
            for (const id of finalMemberIdsSet) {
              if (!originalMemberIdsSet.has(id)) {
                hasActualChange = true
                break
              }
            }
          }
        }

        if (hasActualChange) {
          dbOperations.push({ itemId: item.id, memberIds: Array.from(finalMemberIdsSet) })
        }
      }
    })
    return dbOperations
  }, [selectedMemberId, allItemsDefaults, pendingAssignments])
  const actualDbOperations = useMemo(() => calculateDbChanges(), [calculateDbChanges])

  const saveAssignments = () => {
    if (!selectedMemberId || actualDbOperations.length === 0) {
      toast({ title: t("adminDashboard.defaults.noChangesToSave"), duration: 2000 })
      setPendingAssignments({})
      return
    }

    toast({
      title: t("common.saving"),
      description: t("adminDashboard.defaults.assignmentsSaving"),
    })
    updateAssignment.reset()
    Promise.all(actualDbOperations.map((payload) => updateAssignment.mutateAsync(payload)))
      .then(() => {
        toast({
          title: t("common.success"),
          description: t("adminDashboard.defaults.assignmentsSavedSuccess"),
        })
        utils.admin.itemsDefaults.list.invalidate()
        setPendingAssignments({})
      })
      .catch((error) => {
        console.error("Error saving assignments:", error)
        toast({
          title: t("common.error"),
          description: t("adminDashboard.defaults.assignmentsSaveError"),
          variant: "destructive",
        })
      })
  }

  const [memberSearch, setMemberSearch] = useState("")
  const filteredMembers = members.filter((m) =>
    (m.name ?? m.email).toLowerCase().includes(memberSearch.toLowerCase()),
  )

  const [itemSearch, setItemSearch] = useState("")
  const itemsGroupedByType = useMemo(() => {
    const filtered = allItemsDefaults.filter((i) =>
      (locale === "de" && i.titleDe ? i.titleDe : i.titleEn)
        .toLowerCase()
        .includes(itemSearch.toLowerCase()),
    )
    return Object.values(ItemType).reduce(
      (acc, type) => {
        acc[type] = filtered.filter((item) => item.type === type)
        return acc
      },
      {} as Record<ItemType, ItemWithDefaults[]>,
    )
  }, [allItemsDefaults, itemSearch, locale])

  if (isLoadingMembers || isLoadingItemsDefaults) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">{t("common.loading")}...</p>
      </div>
    )
  }

  const defaultAccordionValues = Object.values(ItemType).filter(
    (typeKey) => (itemsGroupedByType[typeKey as ItemType]?.length ?? 0) > 0,
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,_1fr)_2fr] gap-6">
      <Card className="md:col-span-1 flex flex-col max-h-[75vh]">
        <CardHeader className="py-4">
          <CardTitle className="text-lg">{t("adminDashboard.defaults.teamMembers")}</CardTitle>
          <Input
            aria-label={t("adminDashboard.defaults.searchMembersPlaceholder")}
            placeholder={t("adminDashboard.defaults.searchMembersPlaceholder")}
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="mt-2 text-sm"
          />
        </CardHeader>
        <CardContent className="p-0 flex-grow overflow-hidden">
          <ScrollArea className="h-full">
            {isLoadingMembers && members.length === 0 && (
              <div className="p-4 text-center">
                <Loader2 className="h-5 w-5 animate-spin inline-block" />
              </div>
            )}
            {filteredMembers.length === 0 && !isLoadingMembers && (
              <div className="p-4 text-sm text-muted-foreground text-center flex flex-col items-center gap-2">
                <UsersIcon className="w-10 h-10 text-muted-foreground/50" />
                {memberSearch
                  ? t("adminDashboard.defaults.noMembersMatchFilter")
                  : t("adminDashboard.defaults.noMembersFound")}
              </div>
            )}
            {filteredMembers.map((member) => (
              <button
                key={member.id}
                onClick={() => setSelectedMemberId(member.id)}
                className={clsx(
                  "w-full text-left px-4 py-3 hover:bg-muted/50 flex gap-3 items-center border-b last:border-b-0 transition-colors duration-150",
                  selectedMemberId === member.id && "bg-primary/10 text-primary font-semibold",
                )}
                aria-pressed={selectedMemberId === member.id}
              >
                <User
                  className={clsx(
                    "h-5 w-5 flex-shrink-0",
                    selectedMemberId === member.id ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{member.name ?? member.email}</p>
                  {member.name && (
                    <p className="text-xs truncate text-muted-foreground">{member.email}</p>
                  )}
                </div>
                <Badge
                  variant={selectedMemberId === member.id ? "default" : "secondary"}
                  className="flex-shrink-0 text-xs"
                >
                  {
                    allItemsDefaults.filter((it) =>
                      it.responsibleMembers.some((x: MemberInDefaultList) => x.id === member.id),
                    ).length
                  }
                </Badge>
              </button>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="md:col-span-1 flex flex-col max-h-[75vh]">
        <CardHeader className="py-4">
          <CardTitle className="text-lg">
            {selectedMember
              ? t("adminDashboard.defaults.assignToMember", {
                  memberName: selectedMember.name ?? selectedMember.email,
                })
              : t("adminDashboard.defaults.selectMemberPrompt")}
          </CardTitle>
          <Input
            aria-label={t("search.placeholder")}
            placeholder={t("search.placeholder")}
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            disabled={!selectedMemberId || updateAssignment.isPending}
            className="mt-2 text-sm"
          />
        </CardHeader>
        <CardContent className="p-0 flex-grow overflow-hidden">
          <ScrollArea className="h-full">
            {!selectedMemberId ? (
              <div className="p-6 text-muted-foreground text-sm text-center flex flex-col items-center gap-2">
                <User className="w-10 h-10 text-muted-foreground/50" />
                {t("adminDashboard.defaults.selectMemberToAssign")}
              </div>
            ) : isLoadingItemsDefaults && allItemsDefaults.length === 0 ? (
              <div className="p-4 text-center">
                <Loader2 className="h-5 w-5 animate-spin inline-block" />
              </div>
            ) : defaultAccordionValues.length === 0 ? (
              <div className="p-6 text-muted-foreground text-sm text-center flex flex-col items-center gap-2">
                <Info className="w-10 h-10 text-muted-foreground/50" />
                {itemSearch
                  ? t("adminDashboard.defaults.noItemsMatchFilter")
                  : t("adminDashboard.defaults.noItemsAvailable")}
              </div>
            ) : (
              <Accordion type="multiple" className="w-full" defaultValue={defaultAccordionValues}>
                {Object.values(ItemType).map((typeKey) => {
                  const itemsOfType = itemsGroupedByType[typeKey as ItemType]
                  if (!itemsOfType || itemsOfType.length === 0) return null

                  const allOfTypeEffectivelyAssigned = itemsOfType.every((item) => {
                    const isActuallyAssigned = item.responsibleMembers.some(
                      (m: MemberInDefaultList) => m.id === selectedMemberId,
                    )
                    return typeof pendingAssignments[item.id] === "boolean"
                      ? pendingAssignments[item.id]
                      : isActuallyAssigned
                  })
                  const noneOfTypeEffectivelyAssigned = itemsOfType.every((item) => {
                    const isActuallyAssigned = item.responsibleMembers.some(
                      (m: MemberInDefaultList) => m.id === selectedMemberId,
                    )
                    return typeof pendingAssignments[item.id] === "boolean"
                      ? !pendingAssignments[item.id]
                      : !isActuallyAssigned
                  })
                  const isIndeterminate =
                    !allOfTypeEffectivelyAssigned && !noneOfTypeEffectivelyAssigned
                  return (
                    <AccordionItem value={typeKey} key={typeKey} className="border-b-0">
                      <div className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted/30 text-sm font-medium sticky top-0 bg-card z-10 border-b">
                        <div className="flex items-center gap-3 flex-grow">
                          <Checkbox
                            id={`batch-assign-${typeKey}`}
                            checked={
                              isIndeterminate ? "indeterminate" : allOfTypeEffectivelyAssigned
                            }
                            onCheckedChange={(checked) => {
                              handleBatchTogglePendingAssignment(typeKey as ItemType, !!checked)
                            }}
                            aria-label={`Assign all ${getItemTypeLabel(typeKey as ItemType)} items`}
                            disabled={updateAssignment.isPending || !selectedMemberId}
                          />
                          <span>
                            {getItemTypeLabel(typeKey as ItemType)}{" "}
                            <span className="text-muted-foreground font-normal">
                              ({itemsOfType.length})
                            </span>
                          </span>
                        </div>
                        <AccordionTrigger className="border-0 p-0 hover:no-underline" />
                      </div>
                      <AccordionContent className="pt-0 pb-0">
                        {itemsOfType.map((item) => {
                          const isActuallyAssigned = item.responsibleMembers.some(
                            (m: MemberInDefaultList) => m.id === selectedMemberId,
                          )
                          const isPendingAssigned =
                            typeof pendingAssignments[item.id] === "boolean"
                              ? pendingAssignments[item.id]
                              : isActuallyAssigned
                          const hasPendingChange =
                            pendingAssignments.hasOwnProperty(item.id) &&
                            pendingAssignments[item.id] !== isActuallyAssigned
                          return (
                            <label
                              key={item.id}
                              htmlFor={`assign-${item.id}-${selectedMemberId}`}
                              className={clsx(
                                "flex items-center gap-3 pl-12 pr-4 py-3 text-sm cursor-pointer hover:bg-muted/50 border-t first:border-t-0 transition-colors duration-150",
                                isPendingAssigned && "bg-primary/5 dark:bg-primary/10",
                                hasPendingChange &&
                                  "outline-1 outline-offset-[-1px] outline-amber-400 dark:outline-amber-300",
                                updateAssignment.isPending && "opacity-70 cursor-progress",
                              )}
                            >
                              <Checkbox
                                id={`assign-${item.id}-${selectedMemberId}`}
                                checked={isPendingAssigned}
                                onCheckedChange={(checked) => {
                                  handleTogglePendingAssignment(item.id, !!checked)
                                }}
                                disabled={updateAssignment.isPending || !selectedMemberId}
                                aria-label={`Assign ${locale === "de" && item.titleDe ? item.titleDe : item.titleEn} to ${selectedMember?.name ?? selectedMember?.email}`}
                              />
                              <span className="truncate flex-1">
                                {locale === "de" && item.titleDe ? item.titleDe : item.titleEn}
                              </span>
                              {hasPendingChange && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 flex-shrink-0 text-amber-600 dark:text-amber-500 hover:bg-amber-500/10"
                                      aria-label={t("adminDashboard.defaults.pendingChange")}
                                    >
                                      <Pencil size={14} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("adminDashboard.defaults.pendingChange")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </label>
                          )
                        })}
                      </AccordionContent>
                    </AccordionItem>
                  )
                })}
              </Accordion>
            )}
          </ScrollArea>
        </CardContent>
        {selectedMemberId && (
          <CardFooter className="border-t p-3 flex justify-end gap-2">
            <Button
              onClick={discardPendingChanges}
              variant="outline"
              size="sm"
              disabled={
                (actualDbOperations.length === 0 && Object.keys(pendingAssignments).length === 0) ||
                updateAssignment.isPending
              }
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {t("common.discardChanges")}
            </Button>
            <Button
              onClick={saveAssignments}
              size="sm"
              disabled={actualDbOperations.length === 0 || updateAssignment.isPending}
            >
              {updateAssignment.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t("common.saveChanges")} ({actualDbOperations.length})
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
