"use client"

import { CalendarDays, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useI18n } from "@/locales/i18n"

export function CalendarQueryState({
  loading,
  error,
  retry,
}: {
  loading?: boolean
  error?: boolean
  retry?: () => void
}) {
  const { t } = useI18n()
  const Icon = loading ? Loader2 : error ? RefreshCw : CalendarDays
  return (
    <div
      className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-12 text-center"
      role={error ? "alert" : "status"}
    >
      <div className="rounded-2xl border bg-muted/40 p-4">
        <Icon
          aria-hidden="true"
          className={`size-6 text-muted-foreground ${loading ? "animate-spin" : ""}`}
        />
      </div>
      <p className="font-medium">
        {t(`calendar.${loading ? "loading" : error ? "loadError" : "empty"}`)}
      </p>
      {!loading && !error && (
        <p className="max-w-sm text-sm text-muted-foreground">{t("calendar.emptyHint")}</p>
      )}
      {error && retry && (
        <Button type="button" variant="outline" onClick={retry}>
          {t("calendar.retry")}
        </Button>
      )}
    </div>
  )
}
