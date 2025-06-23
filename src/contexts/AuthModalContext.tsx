"use client"

import React, { createContext, useContext, useState, ReactNode, FormEvent, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp"
import { Separator } from "@/components/ui/separator"
import { useI18n } from "@/locales/i18n"
import { signIn, useSession } from "next-auth/react"
import { toast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { Fingerprint, Loader2 } from "lucide-react"
import { trpc } from "@/utils/trpc"
import { startAuthentication } from "@simplewebauthn/browser"
import { type AuthenticationResponseJSON } from "@simplewebauthn/types"

/**
 * Check if passkey authentication is supported in the current browser
 * @returns Boolean indicating passkey support
 */
function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" && "credentials" in navigator && "create" in navigator.credentials
  )
}

import type { AuthModalView, AuthModalContextType } from "@/types/auth"

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined)

export const AuthModalProvider = ({ children }: { children: ReactNode }) => {
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalView, setAuthModalView] = useState<AuthModalView>("email")
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false)
  const onCloseCallbackRef = useRef<(() => void) | null>(null)

  const { t } = useI18n()
  const { update: updateSessionHook } = useSession()
  const router = useRouter()
  const openAuthModal = (
    initialView: AuthModalView = "email",
    initialEmail: string = "",
    onClose?: () => void,
  ) => {
    setAuthModalView(initialView)
    setEmail(initialEmail || email)
    setOtp("")
    setAuthError(null)
    setIsSubmittingAuth(false)
    onCloseCallbackRef.current = onClose || null
    setAuthModalOpen(true)
  }
  const closeAuthModal = () => {
    setAuthModalOpen(false)
    setOtp("")
    setAuthError(null)
    setIsSubmittingAuth(false)
    setAuthModalView("email")

    // Call the callback if provided (e.g., to close header menu)
    // Use setTimeout to ensure this runs after the state update is complete
    if (onCloseCallbackRef.current) {
      setTimeout(() => {
        if (onCloseCallbackRef.current) {
          onCloseCallbackRef.current()
          onCloseCallbackRef.current = null
        }
      }, 0)
    }
  }
  const handleSignInSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmittingAuth(true)
    setAuthError(null)
    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        let errorMsg = t("errors.loginUnexpected")
        try {
          const errorData = await response.json()
          if (errorData && errorData.error) {
            errorMsg = errorData.error
          } else if (response.status === 429) {
            errorMsg = "Too many requests. Please try again later."
          }
        } catch {
          /* Response not JSON or no error message */
        }
        setAuthError(errorMsg)
        return
      }

      // Success - switch to OTP view
      setAuthModalView("otp")
      toast({
        title: t("auth.checkInbox"),
        description: t("auth.signInLinkSent", { email }),
      })
    } catch (err) {
      console.error("Send OTP error:", err)
      setAuthError(t("errors.loginUnexpected"))
    } finally {
      setIsSubmittingAuth(false)
    }
  }
  const handleVerifyOtpSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmittingAuth(true)
    setAuthError(null)
    try {
      // First, verify the OTP with our backend
      const res = await fetch(`/api/auth/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: otp, email }),
      })

      if (!res.ok) {
        let errorMsg = t("errors.loginUnexpected")
        try {
          const errorData = await res.json()
          if (errorData && errorData.message) {
            errorMsg = errorData.message
          } else if (res.status === 401) {
            errorMsg = t("errors.invalidOtp")
          }
        } catch {
          /* Response not JSON or no message */
        }
        setAuthError(errorMsg)
        return
      }

      const otpResult = await res.json()
      if (!otpResult.success) {
        setAuthError(otpResult.message || t("errors.invalidOtp"))
        return
      } // OTP verification successful, now sign in with NextAuth.js using our custom OTP provider
      const signInResult = await signIn("otp", {
        email: otpResult.email,
        token: otpResult.verifiedToken,
        verified: "true", // Flag that OTP was already verified
        redirect: false,
      })
      if (signInResult?.error) {
        console.error("NextAuth signIn error:", signInResult.error)
        setAuthError(t("errors.loginUnexpected"))
        return
      }
      // Success! Update session and close modal
      await updateSessionHook()
      closeAuthModal()

      toast({
        title: t("auth.signInSuccessTitle"),
        description: t("auth.signInSuccessDescription"),
      })
      router.refresh()
    } catch (err) {
      console.error("OTP Verification error:", err)
      setAuthError(t("errors.loginUnexpected"))
    } finally {
      setIsSubmittingAuth(false)
    }
  }
  // tRPC mutations for passkey authentication
  const passkeyLoginOptions = trpc.webauthn.loginOptions.useMutation()
  const passkeyLogin = trpc.webauthn.login.useMutation()

  const handlePasskeyLogin = async () => {
    setIsPasskeyLoading(true)
    setAuthError(null)

    try {
      // Get authentication options (usernameless flow)
      const options = await passkeyLoginOptions.mutateAsync({}) // Start authentication with the browser
      let authenticationResponse: AuthenticationResponseJSON
      try {
        const credential = await startAuthentication({ optionsJSON: options })

        console.log("🔍 Raw credential from SimpleWebAuthn browser:", {
          id: credential.id,
          rawId: credential.rawId,
          type: credential.type,
          responseClientDataJSON: credential.response?.clientDataJSON?.substring(0, 50) + "...",
          responseAuthenticatorData:
            credential.response?.authenticatorData?.substring(0, 50) + "...",
          responseSignature: credential.response?.signature?.substring(0, 50) + "...",
          responseUserHandle: credential.response?.userHandle?.substring(0, 50) + "...",
        })

        // SimpleWebAuthn browser already returns the correct format
        authenticationResponse = credential

        console.log("🔐 Converted credential data:", {
          id: authenticationResponse.id,
          rawId: authenticationResponse.rawId,
          responseClientDataJSON:
            authenticationResponse.response.clientDataJSON?.substring(0, 50) + "...",
          responseAuthenticatorData:
            authenticationResponse.response.authenticatorData?.substring(0, 50) + "...",
          responseSignature: authenticationResponse.response.signature?.substring(0, 50) + "...",
          responseUserHandle: authenticationResponse.response.userHandle?.substring(0, 50) + "...",
        })
        console.log("🔐 Final credential data:", {
          id: authenticationResponse.id,
          rawId: authenticationResponse.rawId ? "present" : "undefined",
          idLength: authenticationResponse.id?.length,
          rawIdLength: authenticationResponse.rawId?.length,
          clientDataJSONLength: authenticationResponse.response?.clientDataJSON?.length,
          authenticatorDataLength: authenticationResponse.response?.authenticatorData?.length,
          signatureLength: authenticationResponse.response?.signature?.length,
        })
      } catch (browserError: unknown) {
        setAuthError(
          (browserError as Error)?.name === "NotAllowedError"
            ? "Passkey authentication was cancelled or not allowed"
            : "Failed to authenticate with passkey. Please try again.",
        )
        return
      }

      // Find the user ID from the credential
      // The backend should be able to identify the user from the credential
      // Verify the authentication (backend will find user by credential)
      const loginResult = await passkeyLogin.mutateAsync({
        userId: "auto-detect", // Backend will auto-detect from credential
        credential: authenticationResponse,
      })

      // Create session via NextAuth
      await fetch("/api/auth/passkey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: (loginResult as { token: string }).token }),
      })

      // Success! Update session and close modal
      await updateSessionHook()
      closeAuthModal()

      toast({
        title: t("auth.signInSuccessTitle"),
        description: t("auth.signInSuccessDescription"),
      })
      router.refresh()
    } catch (err: unknown) {
      console.error("Passkey authentication error:", err)
      setAuthError((err as Error)?.message || t("security.passkeyRegistrationError"))
    } finally {
      setIsPasskeyLoading(false)
    }
  }

  return (
    <AuthModalContext.Provider
      value={{
        authModalOpen,
        openAuthModal,
        closeAuthModal,
        authModalView,
        email,
        setEmail,
        otp,
        setOtp,
        isSubmittingAuth,
        authError,
      }}
    >
      {children}
      {authModalOpen && (
        <Dialog
          open={authModalOpen}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              closeAuthModal()
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("auth.signInTitle")}</DialogTitle>
              <DialogDescription>
                {authModalView === "email"
                  ? t("auth.signInDescription")
                  : t("auth.enterCodeLabel", { email: email || t("common.yourEmail") })}
              </DialogDescription>
            </DialogHeader>
            {authError && (
              <p className="mb-3 rounded-md border border-destructive bg-destructive/10 p-3 text-center text-sm text-destructive">
                {authError}
              </p>
            )}
            {authModalView === "otp" ? (
              <div className="space-y-6 pt-2">
                <form onSubmit={handleVerifyOtpSubmit} className="space-y-6">
                  <div className="flex flex-col items-center space-y-4">
                    <Label htmlFor="otp-modal" className="sr-only">
                      {t("auth.otpLabel")}
                    </Label>
                    <InputOTP id="otp-modal" maxLength={6} value={otp} onChange={setOtp} autoFocus>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setAuthModalView("email")
                        setAuthError(null)
                      }}
                      disabled={isSubmittingAuth}
                      className="w-full sm:w-auto"
                    >
                      {t("common.back")}
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmittingAuth || otp.length !== 6}
                      className="w-full sm:w-auto h-11"
                    >
                      {isSubmittingAuth ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("auth.verifyingCode")}
                        </>
                      ) : (
                        t("auth.verifyCodeButton")
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </div> // Email view
            ) : (
              <div className="space-y-6 pt-2">
                {/* Passkey option first - more prominent */}
                {isPasskeySupported() && (
                  <div className="space-y-4">
                    <Button
                      type="button"
                      onClick={handlePasskeyLogin}
                      disabled={isPasskeyLoading || isSubmittingAuth}
                      variant="secondary"
                      className="w-full h-12 text-base"
                      size="lg"
                    >
                      {isPasskeyLoading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          {t("auth.authenticating")}
                        </>
                      ) : (
                        <>
                          <Fingerprint className="mr-2 h-5 w-5" />
                          {t("auth.signInWithPasskey")}
                        </>
                      )}
                    </Button>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <Separator className="w-full" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-3 text-muted-foreground font-medium">
                          {t("auth.orContinueWith")}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Email form */}
                <form onSubmit={handleSignInSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-modal" className="text-sm font-medium">
                      {t("common.email")}
                    </Label>
                    <Input
                      id="email-modal"
                      type="email"
                      placeholder={t("common.emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus={!isPasskeySupported()}
                      className="h-11 text-base"
                    />
                  </div>
                  <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                    <DialogClose asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSubmittingAuth}
                        className="w-full sm:w-auto"
                      >
                        {t("common.cancel")}
                      </Button>
                    </DialogClose>
                    <Button
                      type="submit"
                      disabled={isSubmittingAuth || !email}
                      className="w-full sm:w-auto h-11"
                    >
                      {isSubmittingAuth ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("common.sending")}
                        </>
                      ) : (
                        t("auth.sendMagicLinkButton")
                      )}
                    </Button>
                  </DialogFooter>{" "}
                </form>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </AuthModalContext.Provider>
  )
}

export const useAuthModal = () => {
  const context = useContext(AuthModalContext) // Changed from use-context-selector
  if (context === undefined) {
    throw new Error("useAuthModal must be used within an AuthModalProvider")
  }
  return context
}
