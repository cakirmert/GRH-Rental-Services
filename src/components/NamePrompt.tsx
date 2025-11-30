"use client"

import { useEffect, useState, FormEvent, useRef } from "react"
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
import { startRegistration } from "@simplewebauthn/browser"
import { Spinner } from "@/components/ui/spinner"
import type { NamePromptTarget } from "@/types/view"

// Simple passkey support check
function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" && "credentials" in navigator && "create" in navigator.credentials
  )
}

export default function NamePrompt({
  open,
  onOpenChange,
  initialSection,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSection?: NamePromptTarget
}) {
  const { data: session, status, update } = useSession()
  const { t } = useI18n()
  const [name, setName] = useState("")
  const isRentalTeam =
    session?.user?.role === "RENTAL" || session?.user?.role === "ADMIN"

  const passkeySectionRef = useRef<HTMLDivElement | null>(null)
  const addPasskeyButtonRef = useRef<HTMLButtonElement | null>(null)

  // Passkey state
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)

  // Push notification state
  const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const utils = trpc.useUtils()
  const { data: userPreferences } = trpc.user.getPreferences.useQuery(undefined, {
    refetchOnWindowFocus: false,
    enabled: isRentalTeam,
  })
  const [emailBookingEnabled, setEmailBookingEnabled] = useState(true)
  const updateName = trpc.user.updateName.useMutation({
    onSuccess: async () => {
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
      utils.user.getPreferences.setData(undefined, data)
      setEmailBookingEnabled(data.emailBookingNotifications)
      toast({
        title: data.emailBookingNotifications
          ? t("security.bookingEmailsEnabledToast")
          : t("security.bookingEmailsDisabledToast"),
      })
    },
    onError: (error) => {
      setEmailBookingEnabled(userPreferences?.emailBookingNotifications ?? true)
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      })
    },
  })
  useEffect(() => {
    if (status === "authenticated") {
      setName(session?.user?.name ?? "")
    }
  }, [status, session])

  useEffect(() => {
    if (
      isRentalTeam &&
      typeof userPreferences?.emailBookingNotifications !== "undefined"
    ) {
      setEmailBookingEnabled(userPreferences.emailBookingNotifications)
    }
  }, [isRentalTeam, userPreferences?.emailBookingNotifications])

  // Check push notification support and subscription
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true)
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription()
        setPushSubscription(sub)
      })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (initialSection === "passkeys") {
      passkeySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      setTimeout(() => addPasskeyButtonRef.current?.focus(), 250)
    }
  }, [initialSection, open])
  // Track if the window has focus to prevent closing on tab switch
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Prevent modal from closing when tab becomes hidden/visible
      if (document.hidden) {
        // Tab is being hidden, don't close modal
        return
      }
    }

    const handleFocus = () => {
      // When window regains focus, ensure modal stays open
      if (open && !document.hidden) {
        // Force modal to stay open after tab switch
        setTimeout(() => {
          if (open) {
            // Modal should remain open
          }
        }, 100)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)
    window.addEventListener("blur", () => {
      // Prevent closing on blur (tab switch)
    })

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("blur", () => {})
    }
  }, [open])

  // Don't render anything if not authenticated
  if (status !== "authenticated") return null

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

      // Start registration with the browser
      const credential = await startRegistration({ optionsJSON: options })

      // Send the response to server for verification
      await registerFinish.mutateAsync({ credential })

      toast({
        title: t("security.passkeyRegistered"),
        description: t("security.passkeyRegisteredDesc"),
      })

      // Refetch the passkeys list to show the new one
      refetchPasskeys()
    } catch (err: unknown) {
      console.error("Passkey registration error:", err)
      let errorMessage = t("security.passkeyRegistrationFailed")

      if (err instanceof Error && err.name === "NotAllowedError") {
        errorMessage = t("security.passkeyRegistrationCancelled")
      } else if (err instanceof Error && err.message) {
        errorMessage = err.message
      }

      setPasskeyError(errorMessage)
    } finally {
      setIsRegisteringPasskey(false)
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
        {/* Overlay scrolls and centers */}{" "}
        <Dialog.Overlay
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm grid place-items-center overflow-auto p-4"
        >
          <Dialog.Content
            className="w-full z-[100] max-w-2xl max-h-[90vh] bg-background rounded-xl shadow-lg flex flex-col overflow-hidden"
          >
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
                          setEmailBookingEnabled(checked)
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
              <div ref={passkeySectionRef}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Fingerprint className="h-5 w-5" />
                      {t("security.passkeysTitle")}
                    </CardTitle>
                    <CardDescription>{t("security.passkeysDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Passkey Support Check */}
                    {!isPasskeySupported() ? (
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
                            ref={addPasskeyButtonRef}
                            onClick={handleRegisterPasskey}
                            disabled={isRegisteringPasskey}
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
                                      <Button variant="ghost" size="sm">
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
              </div>
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
                <CardContent>
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
                          {deleteAccount.isPending && (
                            <Spinner className="mr-2 size-4" />
                          )}
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
