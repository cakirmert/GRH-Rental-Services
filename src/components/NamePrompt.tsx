"use client"

import { useEffect, useState, useRef, useSyncExternalStore, FormEvent } from "react"
import { useSession, signOut } from "next-auth/react"
import * as Dialog from "@radix-ui/react-dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { trpc } from "@/utils/trpc"
import { useI18n } from "@/locales/i18n"
import { Key, Plus, Trash2, Shield, Fingerprint, X, Bell, BellOff } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { startRegistration } from "@simplewebauthn/browser-v14"
import { Spinner } from "@/components/ui/spinner"
import { isPasskeySupported } from "@/lib/webauthnUtils"
import type { NamePromptSection } from "@/types/view"
import { BERLIN_TIME_ZONE } from "@/lib/berlin-time"

type NamePromptProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  focusSection?: NamePromptSection
}

const subscribeToCapabilities = () => () => {}
const noBrowserCapabilities = () => false
const hasPushSupport = () => "serviceWorker" in navigator && "PushManager" in window

export default function NamePrompt(props: NamePromptProps) {
  const { data: session, status, update } = useSession()
  if (!props.open || status !== "authenticated" || !session?.user?.id) return null
  return (
    <AccountSettings
      key={JSON.stringify([session.user.id, session.user.role, session.user.isSuperAdmin])}
      {...props}
      session={session}
      update={update}
    />
  )
}

function AccountSettings({
  open,
  onOpenChange,
  focusSection,
  session,
  update,
}: NamePromptProps & {
  session: NonNullable<ReturnType<typeof useSession>["data"]>
  update: ReturnType<typeof useSession>["update"]
}) {
  const { t } = useI18n()
  const passkeySigninOnly = process.env.NEXT_PUBLIC_PASSKEY_SIGNIN_ONLY === "true"
  const [name, setName] = useState(session.user.name ?? "")
  const isRentalTeam = session?.user?.role === "RENTAL" || session?.user?.role === "ADMIN"

  // Passkey state
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  // Push notification state
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null)
  const pushSupported = useSyncExternalStore(
    subscribeToCapabilities,
    hasPushSupport,
    noBrowserCapabilities,
  )
  const passkeysSupported = useSyncExternalStore(
    subscribeToCapabilities,
    isPasskeySupported,
    noBrowserCapabilities,
  )
  const [pushLoading, setPushLoading] = useState(false)
  const utils = trpc.useUtils()
  const { data: userPreferences } = trpc.user.getPreferences.useQuery(undefined, {
    refetchOnWindowFocus: false,
    enabled: isRentalTeam,
  })
  const [emailBookingDraft, setEmailBookingDraft] = useState<boolean | null>(null)
  const emailBookingEnabled =
    emailBookingDraft ?? userPreferences?.emailBookingNotifications ?? true
  const updateName = trpc.user.updateName.useMutation({
    onSuccess: async () => {
      if (!active.current) return
      await update()
      toast({
        title: t("profile.updateSuccess"),
        description: t("profile.nameUpdated"),
      })
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      })
    },
  })

  const selfDemoteMutation = trpc.user.selfDemote.useMutation({
    onSuccess: async () => {
      toast({
        title: t("common.success"),
        description: "You have successfully stepped down.",
      })
      window.location.reload()
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message || "Failed to step down.",
        variant: "destructive",
      })
    },
  })
  // Fetch user's passkeys from the backend
  const { data: userPasskeys = [], refetch: refetchPasskeys } = trpc.user.getPasskeys.useQuery()

  // Passkey registration mutations
  const registerOptions = trpc.webauthn.registerOptions.useMutation()
  const registerFinish = trpc.webauthn.register.useMutation()

  // Delete passkey mutation
  const deletePasskeyMutation = trpc.user.deletePasskey.useMutation({
    onSuccess: () => {
      refetchPasskeys()
      toast({
        title: t("security.passkeyDeleted"),
        description: t("security.passkeyDeletedDesc"),
      })
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      })
    },
  })
  const updatePreferences = trpc.user.updatePreferences.useMutation({
    onSuccess: (data) => {
      if (!active.current) return
      utils.user.getPreferences.setData(undefined, data)
      setEmailBookingDraft(null)
      toast({
        title: data.emailBookingNotifications
          ? t("security.bookingEmailsEnabledToast")
          : t("security.bookingEmailsDisabledToast"),
      })
    },
    onError: (error) => {
      if (!active.current) return
      setEmailBookingDraft(null)
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      })
    },
  })
  const passkeySectionRef = useRef<HTMLDivElement | null>(null)

  // Check push notification support and subscription
  useEffect(() => {
    if (pushSupported) {
      let current = true
      navigator.serviceWorker.ready
        .then(async (reg) => {
          const sub = await reg.pushManager.getSubscription()
          if (current) setPushSubscription(sub)
        })
        .catch(() => {
          /* Unsupported or unavailable browser registration. */
        })
      return () => {
        current = false
      }
    }
  }, [pushSupported])

  useEffect(() => {
    if (open && focusSection === "passkeys" && passkeySectionRef.current) {
      passkeySectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
      const highlight = passkeySectionRef.current.animate?.(
        [{ boxShadow: "0 0 0 2px var(--primary)" }, { boxShadow: "0 0 0 2px transparent" }],
        { duration: 2400, easing: "ease-out" },
      )
      return () => highlight?.cancel()
    }
  }, [open, focusSection])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      updateName.mutate({ name: name.trim() })
    }
  }
  const handleRegisterPasskey = async () => {
    if (!session?.user?.id) return

    setIsRegisteringPasskey(true)
    setPasskeyError(null)

    try {
      // Get registration options from server
      const options = await registerOptions.mutateAsync({ userId: session.user.id })
      if (!active.current) return

      // Start registration with the browser
      const credential = await startRegistration({ optionsJSON: options })
      if (!active.current) return

      // Send the response to server for verification
      await registerFinish.mutateAsync({ credential })
      if (!active.current) return

      toast({
        title: t("security.passkeyRegistered"),
        description: t("security.passkeyRegisteredDesc"),
      })

      // Refetch the passkeys list to show the new one
      refetchPasskeys()
    } catch (err: unknown) {
      if (!active.current) return
      console.error("Passkey registration error:", err)
      let errorMessage = t("security.passkeyRegistrationFailed")

      if (err instanceof Error && err.name === "NotAllowedError") {
        errorMessage = t("security.passkeyRegistrationCancelled")
      } else if (err instanceof Error && err.message) {
        errorMessage = err.message
      }

      setPasskeyError(errorMessage)
    } finally {
      if (active.current) setIsRegisteringPasskey(false)
    }
  }
  const handleDeletePasskey = (passkeyId: string) => {
    deletePasskeyMutation.mutate({ credentialId: passkeyId })
  }

  const deleteAccount = trpc.user.deleteAccount.useMutation({
    onSuccess: () => signOut(),
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      })
    },
  })
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en", {
      timeZone: BERLIN_TIME_ZONE,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }
  const handleClose = () => {
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Overlay scrolls and centers */}
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm grid place-items-center overflow-auto p-4">
          <Dialog.Content className="w-full z-[100] max-w-2xl max-h-[90vh] bg-background rounded-xl shadow-lg flex flex-col overflow-hidden">
            {/* Hidden title for a11y */}
            <Dialog.Title asChild>
              <VisuallyHidden>{t("profile.accountSettings")}</VisuallyHidden>
            </Dialog.Title>{" "}
            {/* Header */}
            <header className="flex-shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-background border-b">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{t("profile.accountSettings")}</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="ml-auto h-8 w-8 p-0"
                aria-label={t("common.close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </header>
            {/* Scrollable Content */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
              {/* Profile Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("profile.personalInfo")}</CardTitle>
                  <CardDescription>{t("profile.personalInfoDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  {" "}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name-input">{t("common.name")}</Label>
                      <Input
                        id="name-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="h-11 sm:h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email-display">{t("common.email")}</Label>
                      <Input
                        id="email-display"
                        value={session?.user?.email || ""}
                        disabled
                        className="bg-muted h-11 sm:h-10"
                      />
                      <p className="text-xs text-muted-foreground">{t("profile.emailReadonly")}</p>
                    </div>
                    <Button
                      type="submit"
                      disabled={updateName.isPending || !name.trim()}
                      className="h-11 sm:h-10"
                    >
                      {updateName.isPending && <Spinner className="mr-2 size-4" />}
                      {updateName.isPending ? t("common.submitting") : t("profile.saveButton")}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Push Notifications Section - Moved up for visibility */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {pushSubscription ? (
                      <Bell className="h-5 w-5" />
                    ) : (
                      <BellOff className="h-5 w-5" />
                    )}
                    {t("security.pushNotifications")}
                  </CardTitle>
                  <CardDescription>{t("security.pushNotificationsDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!pushSupported ? (
                    <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        {t("notifications.unsupported")}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">
                          {pushSubscription
                            ? t("security.notificationsEnabled")
                            : t("security.notificationsDisabled")}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {pushSubscription
                            ? t("security.notificationsEnabledDesc")
                            : t("security.notificationsDisabledDesc")}
                        </p>
                      </div>
                      <Switch
                        checked={!!pushSubscription}
                        onCheckedChange={async (checked) => {
                          setPushLoading(true)
                          try {
                            const controls = (
                              window as typeof window & {
                                pushNotificationControls?: {
                                  subscribe: () => Promise<void>
                                  unsubscribe: () => Promise<void>
                                }
                              }
                            )?.pushNotificationControls
                            if (controls) {
                              if (checked && !pushSubscription) {
                                await controls.subscribe()
                                const reg = await navigator.serviceWorker.ready
                                const sub = await reg.pushManager.getSubscription()
                                setPushSubscription(sub)
                              } else if (!checked && pushSubscription) {
                                await controls.unsubscribe()
                                setPushSubscription(null)
                              }
                            }
                          } catch (error) {
                            console.error("Notification toggle error:", error)
                            toast({
                              title: t("common.error"),
                              description: t("notifications.toggleError", {
                                defaultValue: "Failed to toggle notifications",
                              }),
                              variant: "destructive",
                            })
                          } finally {
                            setPushLoading(false)
                          }
                        }}
                        disabled={pushLoading}
                      />
                    </div>
                  )}
                  {isRentalTeam && (
                    <div className="flex items-center justify-between border-t pt-4">
                      <div>
                        <h4 className="font-medium">
                          {emailBookingEnabled
                            ? t("security.bookingEmailsEnabled")
                            : t("security.bookingEmailsDisabled")}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {emailBookingEnabled
                            ? t("security.bookingEmailsEnabledDesc")
                            : t("security.bookingEmailsDisabledDesc")}
                        </p>
                      </div>
                      <Switch
                        checked={emailBookingEnabled}
                        onCheckedChange={(checked) => {
                          setEmailBookingDraft(checked)
                          updatePreferences.mutate({
                            emailBookingNotifications: checked,
                          })
                        }}
                        disabled={updatePreferences.isPending}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Passkeys Section */}
              <Card ref={passkeySectionRef}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Fingerprint className="h-5 w-5" />
                    {t("security.passkeysTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      passkeySigninOnly
                        ? "security.passkeyPreviewReadOnly"
                        : "security.passkeysDescription",
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Passkey Support Check */}
                  {!passkeysSupported ? (
                    <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        {t("security.passkeyNotSupported")}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Add Passkey Button */}
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{t("security.addPasskey")}</h4>
                          <p className="text-sm text-muted-foreground">
                            {t("security.addPasskeyDesc")}
                          </p>
                        </div>{" "}
                        <Button
                          onClick={handleRegisterPasskey}
                          disabled={isRegisteringPasskey || passkeySigninOnly}
                          variant="outline"
                          size="sm"
                          className="h-10 sm:h-9"
                        >
                          {isRegisteringPasskey ? (
                            <Spinner className="mr-2 size-4" />
                          ) : (
                            <Plus className="mr-2 h-4 w-4" />
                          )}
                          {isRegisteringPasskey
                            ? t("security.registering")
                            : t("security.addPasskey")}
                        </Button>
                      </div>

                      {passkeyError && (
                        <div className="p-3 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/20">
                          <p className="text-sm text-red-800 dark:text-red-200">{passkeyError}</p>
                        </div>
                      )}

                      <Separator />

                      {/* Passkey List */}
                      <div className="space-y-3">
                        <h4 className="font-medium">{t("security.yourPasskeys")}</h4>
                        {userPasskeys.length === 0 ? (
                          <div className="p-4 border border-dashed rounded-lg text-center">
                            <Key className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              {t("security.noPasskeys")}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {userPasskeys.map((passkey) => (
                              <div
                                key={passkey.id}
                                className="flex items-center justify-between p-3 border rounded-lg"
                              >
                                <div className="flex items-center gap-3">
                                  <Key className="h-4 w-4 text-muted-foreground" />
                                  <div>
                                    <p className="font-medium text-sm">{passkey.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {t("security.createdOn")} {formatDate(passkey.createdAt)}
                                    </p>
                                    {passkey.lastUsed && (
                                      <p className="text-xs text-muted-foreground">
                                        {t("security.lastUsed")} {formatDate(passkey.lastUsed)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={passkeySigninOnly}
                                      aria-label={t("security.deletePasskeyTitle")}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        {t("security.deletePasskeyTitle")}
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {t("security.deletePasskeyDesc", { name: passkey.name })}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeletePasskey(passkey.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        {t("security.deletePasskey")}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Login Methods */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t("security.loginMethods")}</CardTitle>
                  <CardDescription>{t("security.loginMethodsDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <div>
                        <p className="font-medium text-sm">{t("security.emailOtp")}</p>
                        <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{t("security.active")}</Badge>
                  </div>

                  {userPasskeys.length > 0 && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <div>
                          <p className="font-medium text-sm">{t("security.passkeys")}</p>
                          <p className="text-xs text-muted-foreground">
                            {t("security.passkeyCount", { count: userPasskeys.length })}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{t("security.active")}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Danger Zone */}
              <Card className="border-destructive/20">
                <CardHeader>
                  <CardTitle className="text-lg text-destructive">
                    {t("profile.dangerZone")}
                  </CardTitle>
                  <CardDescription>{t("profile.dangerZoneDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Self-Demote Option for Staff */}
                  {(session?.user?.role === "ADMIN" || session?.user?.role === "RENTAL") && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-destructive border-destructive hover:bg-destructive/10"
                        >
                          Step Down (Remove Staff Privileges)
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you sure you want to step down?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove your team privileges and change your role to a regular
                            User. You will lose access to the team portal and management dashboard.
                            If you are the last Admin, this action will fail unless you delete your
                            account entirely.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              selfDemoteMutation.mutate()
                            }}
                            disabled={selfDemoteMutation.isPending}
                          >
                            {selfDemoteMutation.isPending && <Spinner className="mr-2 size-4" />}
                            Confirm Step Down
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("profile.deleteButton")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("profile.confirmDeleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("profile.confirmDeleteDescription")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteAccount.mutate()}
                          disabled={deleteAccount.isPending}
                        >
                          {deleteAccount.isPending && <Spinner className="mr-2 size-4" />}
                          {t("profile.confirmDeleteAction")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </div>
            {/* Footer */}
            <footer className="flex-shrink-0 border-t bg-background px-6 py-4">
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleClose}>
                  {t("common.close")}
                </Button>
              </div>
            </footer>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
