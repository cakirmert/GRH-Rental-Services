"use client"

import { useRef, useState } from "react"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "@/server/routers/appRouter"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { retentionCopy } from "@/locales/retention"
import { formatInBerlin } from "@/lib/berlin-time"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Trash2 } from "lucide-react"

type InactiveAccount =
  inferRouterOutputs<AppRouter>["admin"]["inactiveAccounts"]["accounts"][number]

export default function InactiveAccountsTab({
  requestedReviewId,
  onShowAll,
}: {
  requestedReviewId?: string
  onShowAll?: () => void
}) {
  const { locale } = useI18n()
  const copy = retentionCopy[locale]
  const utils = trpc.useUtils()
  const [manualSelection, setManualSelection] = useState<InactiveAccount | null>(null)
  const [targetHandled, setTargetHandled] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const returnFocus = useRef<HTMLButtonElement | null>(null)
  const query = trpc.admin.inactiveAccounts.useInfiniteQuery(
    { limit: 25, ...(requestedReviewId ? { userId: requestedReviewId } : {}) },
    {
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      staleTime: 0,
      refetchOnMount: "always",
    },
  )
  const deletion = trpc.admin.deleteInactiveAccount.useMutation({
    onSuccess: () => {
      setManualSelection(null)
      setTargetHandled(true)
      setDeleted(true)
      void utils.invalidate()
    },
  })
  const accounts = query.data?.pages.flatMap((page) => page.accounts) ?? []
  // A badge is already the user's first action. Wait for a fresh targeted lookup,
  // then offer confirmation directly; cached eligibility must never open it.
  const checkingTarget =
    !!requestedReviewId && (query.isFetching || !query.isFetchedAfterMount) && !query.isError
  const requestedAccount =
    requestedReviewId && !targetHandled && !checkingTarget && !query.isError
      ? accounts.find((account) => account.id === requestedReviewId)
      : undefined
  const selected = manualSelection ?? (requestedAccount?.canDelete ? requestedAccount : null)
  const roles = { USER: copy.resident, RENTAL: copy.rental, ADMIN: copy.admin }

  function review(account: InactiveAccount, trigger: HTMLButtonElement) {
    returnFocus.current = trigger
    deletion.reset()
    setDeleted(false)
    setManualSelection(account)
  }

  function refresh() {
    if (selected) setTargetHandled(true)
    setManualSelection(null)
    deletion.reset()
    void query.refetch()
  }

  return (
    <section aria-labelledby="inactive-accounts-title" className="space-y-5 p-4 sm:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Clock3 aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
          <h2
            ref={heading}
            tabIndex={-1}
            id="inactive-accounts-title"
            className="text-xl font-semibold tracking-tight"
          >
            {copy.title}
          </h2>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {copy.description}
        </p>
        {requestedReviewId && onShowAll && (
          <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={onShowAll}>
            {copy.showAll}
          </Button>
        )}
      </header>

      {deleted && (
        <p role="status" className="text-sm font-medium">
          {copy.deleted}
        </p>
      )}

      {query.isLoading || checkingTarget ? (
        <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {copy.loading}
        </p>
      ) : query.isError && (accounts.length === 0 || !!requestedReviewId) ? (
        <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 p-4">
          <p className="text-sm">{copy.loadError}</p>
          <Button type="button" variant="outline" onClick={refresh}>
            {copy.retry}
          </Button>
        </div>
      ) : accounts.length === 0 ? (
        <div className="space-y-2 rounded-xl border border-dashed p-6 text-center">
          <CheckCircle2 aria-hidden="true" className="mx-auto h-6 w-6 text-muted-foreground" />
          <h3 className="font-medium">{requestedReviewId ? copy.noLongerInactive : copy.empty}</h3>
          <p className="text-sm text-muted-foreground">
            {requestedReviewId ? copy.noLongerInactiveDetail : copy.emptyDetail}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {copy.listed}: {accounts.length}
          </p>
          <ul className="space-y-3">
            {accounts.map((account) => {
              const name = account.name || copy.unnamed
              const handover = account.blockers.some((blocker) => blocker !== "protectedAccount")
              return (
                <li key={account.id}>
                  <article
                    aria-labelledby={`inactive-name-${account.id}`}
                    className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            id={`inactive-name-${account.id}`}
                            className="min-w-0 font-semibold [overflow-wrap:anywhere]"
                          >
                            {name}
                          </h3>
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100"
                          >
                            <Clock3 aria-hidden="true" className="h-3 w-3" />
                            {copy.inactive}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                          {account.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {account.isSuperAdmin ? copy.superAdmin : roles[account.role]}
                        </p>
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                        <p>{copy.lastActive}</p>
                        <time
                          dateTime={new Date(account.lastActiveAt).toISOString()}
                          className="mt-1 block font-medium text-foreground"
                        >
                          {formatInBerlin(
                            account.lastActiveAt,
                            locale === "de" ? "dd.MM.yyyy · HH:mm" : "dd MMM yyyy · HH:mm",
                          )}
                        </time>
                        <p className="mt-0.5">{copy.berlinTime}</p>
                      </div>
                    </div>
                    {account.blockers.length > 0 ? (
                      <div
                        id={`inactive-blockers-${account.id}`}
                        className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm"
                      >
                        <ul className="space-y-1.5">
                          {account.blockers.map((blocker) => (
                            <li key={blocker} className="flex items-start gap-2">
                              <AlertTriangle
                                aria-hidden="true"
                                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                              />
                              <span>
                                {copy[blocker]}
                                {blocker !== "protectedAccount"
                                  ? `: ${account.counts[blocker]}`
                                  : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {handover && (
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {copy.handover}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                        {copy.ready}
                      </p>
                    )}
                    <div className="flex sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-10 w-full text-destructive hover:text-destructive sm:w-auto"
                        disabled={!account.canDelete || deletion.isPending}
                        aria-label={`${copy.delete}: ${name}`}
                        aria-describedby={
                          account.blockers.length ? `inactive-blockers-${account.id}` : undefined
                        }
                        onClick={(event) => review(account, event.currentTarget)}
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        {copy.delete}
                      </Button>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
          {query.isError && (
            <p role="alert" className="text-sm text-destructive">
              {copy.loadError}
            </p>
          )}
          {query.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
            </Button>
          )}
        </>
      )}

      <AlertDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !deletion.isPending) {
            setManualSelection(null)
            setTargetHandled(true)
          }
        }}
      >
        <AlertDialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (!deleted && returnFocus.current?.isConnected) returnFocus.current.focus()
            else heading.current?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          {selected && (
            <div className="min-w-0 space-y-1 rounded-lg border bg-muted/30 p-3 text-sm [overflow-wrap:anywhere]">
              <p className="font-semibold">{selected.name || copy.unnamed}</p>
              <p className="text-muted-foreground">{selected.email}</p>
            </div>
          )}
          {deletion.error && (
            <div role="alert" className="space-y-2 text-sm">
              <p className="text-destructive">{copy.deleteError}</p>
              <Button type="button" variant="outline" onClick={refresh}>
                {copy.refresh}
              </Button>
            </div>
          )}
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={deletion.isPending}>{copy.cancel}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!selected?.canDelete || deletion.isPending || !!deletion.error}
              onClick={() =>
                selected &&
                deletion.mutate({
                  userId: selected.id,
                  expectedLastLoginAt: selected.lastLoginAt,
                  expectedLastActiveAt: selected.lastActiveAt,
                })
              }
            >
              {deletion.isPending && (
                <Loader2
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                />
              )}
              {deletion.isPending ? copy.deleting : copy.confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
