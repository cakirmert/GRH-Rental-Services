"use client"

import React from "react"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table"
import { Loader2, AlertCircle } from "lucide-react"
import { format } from "date-fns"

export default function CancelledByStaffTab() {
  const { t, locale } = useI18n()
  const { data = [], isLoading, error } = trpc.admin.staffCancelledBookings.useQuery()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t("common.loading")}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 text-destructive py-6">
        <AlertCircle className="h-4 w-4" />
        <span>{t("errors.fetchBookings")}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("adminDashboard.cancellations.title")}</CardTitle>
          <CardDescription>{t("adminDashboard.cancellations.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("adminDashboard.cancellations.none")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("adminDashboard.cancellations.headers.item")}</TableHead>
                  <TableHead>{t("adminDashboard.cancellations.headers.requester")}</TableHead>
                  <TableHead>{t("adminDashboard.cancellations.headers.cancelledBy")}</TableHead>
                  <TableHead>{t("adminDashboard.cancellations.headers.cancelledOn")}</TableHead>
                  <TableHead>{t("adminDashboard.cancellations.headers.notes")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      {locale === "de" ? b.item?.titleDe || b.item?.titleEn : b.item?.titleEn}
                    </TableCell>
                    <TableCell>{b.user?.name || b.user?.email}</TableCell>
                    <TableCell>
                      {b.cancelledBy?.name || b.cancelledBy?.email ||
                        t("adminDashboard.cancellations.unknownStaff")}
                    </TableCell>
                    <TableCell>{format(new Date(b.cancelledAt ?? b.updatedAt), "PP")}</TableCell>
                    <TableCell className="whitespace-pre-wrap max-w-xs">{b.notes}</TableCell>
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
