// src/components/admin/MembersTab.tsx
"use client"

import React, { useState } from "react"
import { Role } from "@prisma/client"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"

import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/server/routers/_app"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Loader2, UserPlus, Trash2, Users as UsersIcon, AlertTriangle } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

type RouterOutput = inferRouterOutputs<AppRouter>

type MemberManagementUserInList = RouterOutput["admin"]["memberManagement"]["list"][number]

export default function MembersTab() {
  const { t } = useI18n()

  const [addMemberEmail, setAddMemberEmail] = useState("")
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false)

  const {
    data: rentalMembers = [],
    isLoading: isLoadingMembers,
    refetch: refetchMembers,
    error: membersError,
  } = trpc.admin.memberManagement.list.useQuery(undefined, {
    initialData: [],
  })

  React.useEffect(() => {
    if (membersError) {
      toast({
        title: t("common.error"),
        description: t("errors.fetchMembersError"),
        variant: "destructive",
      })
      console.error("Error fetching members:", membersError.message)
    }
  }, [membersError, t])

  const addMemberMutation = trpc.admin.memberManagement.add.useMutation({
    onSuccess: (data) => {
      toast({
        title: t("common.success"),
        description: t("adminDashboard.members.memberAdded", { email: data.email }),
      })
      refetchMembers()
      setAddMemberEmail("")
      setIsAddMemberDialogOpen(false)
    },
    onError: (error: { message: string }) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" })
    },
  })

  const removeMemberMutation = trpc.admin.memberManagement.remove.useMutation({
    onSuccess: (data) => {
      toast({
        title: t("common.success"),
        description: t("adminDashboard.members.memberRemoved", { email: data.email }),
      })
      refetchMembers()
    },
    onError: (error: { message: string }) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" })
    },
  })

  const handleAddMemberSubmit = () => {
    if (!addMemberEmail.trim() || !/^\S+@\S+\.\S+$/.test(addMemberEmail.trim())) {
      toast({
        title: t("common.error"),
        description: t("errors.invalidEmail"),
        variant: "destructive",
      })
      return
    }
    addMemberMutation.mutate({ email: addMemberEmail.trim() })
  }

  if (isLoadingMembers && rentalMembers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">{t("common.loading")}...</p>
      </div>
    )
  }

  if (membersError && rentalMembers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-destructive p-6">
        <AlertTriangle className="h-8 w-8" />
        <p>{t("errors.fetchMembersError")}</p>
        <p className="text-sm text-muted-foreground">{membersError.message}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div className="space-y-1">
            <CardTitle className="text-xl">{t("adminDashboard.members.title")}</CardTitle>
            <CardDescription>{t("adminDashboard.members.description")}</CardDescription>
          </div>
          <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="text-sm">
                <UserPlus className="mr-2 h-4 w-4" />
                {t("adminDashboard.members.addMemberButton")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("adminDashboard.members.addDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("adminDashboard.members.addDialogDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-2">
                <Label htmlFor="add-member-email" className="text-sm">
                  {t("common.email")}
                </Label>
                <Input
                  id="add-member-email"
                  type="email"
                  value={addMemberEmail}
                  onChange={(e) => setAddMemberEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="text-sm h-9"
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" size="sm">
                    {t("common.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  onClick={handleAddMemberSubmit}
                  disabled={addMemberMutation.isPending}
                  size="sm"
                >
                  {addMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("adminDashboard.members.confirmAddButton")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {rentalMembers.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
              <UsersIcon className="w-12 h-12 text-muted-foreground/40" />
              {t("adminDashboard.members.noMembersYet")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 pr-2 py-3">{t("common.name")}</TableHead>
                  <TableHead className="px-4 py-3">{t("common.email")}</TableHead>
                  <TableHead className="px-4 py-3">{t("common.role")}</TableHead>
                  <TableHead className="text-right pr-4 pl-2 py-3">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rentalMembers.map((member: MemberManagementUserInList) => (
                  <TableRow key={member.id} className="text-sm">
                    <TableCell className="font-medium pl-4 pr-2 py-2.5">
                      {member.name || (
                        <span className="italic text-muted-foreground">{t("common.notSet")}</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2.5">{member.email}</TableCell>
                    <TableCell className="px-4 py-2.5">
                      <Badge variant={member.role === Role.ADMIN ? "default" : "secondary"}>
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1 pr-4 pl-2 py-2.5">
                      {member.role !== Role.ADMIN && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            {/* Ensure Button is the single child for TooltipTrigger */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">
                                {t("adminDashboard.members.removeButton")}
                              </span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("adminDashboard.members.confirmRemoveTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("adminDashboard.members.confirmRemoveDescription", {
                                  email: member.email,
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeMemberMutation.mutate({ userId: member.id })}
                                disabled={removeMemberMutation.isPending}
                              >
                                {removeMemberMutation.isPending && (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {t("adminDashboard.members.confirmRemoveAction")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
