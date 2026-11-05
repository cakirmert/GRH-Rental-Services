import { trpc } from "@/utils/trpc"
import { startAuthentication, startRegistration } from "@simplewebauthn/browser-v14"

/** Use the same JSON conversion and verifier contract as the account settings flow. */
export function useWebAuthn() {
  const registerOptions = trpc.webauthn.registerOptions.useMutation()
  const registerFinish = trpc.webauthn.register.useMutation()
  const loginOptions = trpc.webauthn.loginOptions.useMutation()
  const loginFinish = trpc.webauthn.login.useMutation()

  const register = async (userId: string) => {
    const options = await registerOptions.mutateAsync({ userId })
    const credential = await startRegistration({ optionsJSON: options })
    await registerFinish.mutateAsync({ credential })
  }

  const login = async (usernameOrEmail: string) => {
    const opts = await loginOptions.mutateAsync({ usernameOrEmail })
    const credential = await startAuthentication({ optionsJSON: opts })
    const result = await loginFinish.mutateAsync({ userId: "auto-detect", credential })
    const response = await fetch("/api/auth/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: result.token }),
    })
    if (!response.ok) throw new Error("Passkey session creation failed")
  }

  return { register, login, registerOptions, registerFinish, loginOptions, loginFinish }
}
