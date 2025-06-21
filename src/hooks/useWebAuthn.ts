import { trpc } from "@/utils/trpc"

/**
 * Converts ArrayBuffer to base64 URL-safe string
 * @param buffer - The ArrayBuffer to convert
 * @returns Base64 URL-safe encoded string
 */
function arrayBufferToB64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let str = ""
  bytes.forEach((b) => (str += String.fromCharCode(b)))
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Hook that provides WebAuthn (passkey) authentication functionality
 * @returns Object containing register and login functions with their respective mutations
 */
export function useWebAuthn() {
  const registerOptions = trpc.webauthn.registerOptions.useMutation()
  const registerFinish = trpc.webauthn.register.useMutation()
  const loginOptions = trpc.webauthn.loginOptions.useMutation()
  const loginFinish = trpc.webauthn.login.useMutation()

  const register = async (userId: string) => {
    const opts = await registerOptions.mutateAsync({ userId })
    const cred = (await navigator.credentials.create({
      publicKey: opts as unknown as PublicKeyCredentialCreationOptions,
    })) as PublicKeyCredential
    const credential = {
      id: cred.id,
      rawId: arrayBufferToB64(cred.rawId),
      response: {
        clientDataJSON: arrayBufferToB64(
          (cred.response as AuthenticatorAttestationResponse).clientDataJSON,
        ),
        attestationObject: arrayBufferToB64(
          (cred.response as AuthenticatorAttestationResponse).attestationObject,
        ),
      },
      type: cred.type,
    }
    await registerFinish.mutateAsync({ credential })
  }

  const login = async (usernameOrEmail: string) => {
    const opts = (await loginOptions.mutateAsync({ usernameOrEmail })) as unknown as {
      userId: string
    } & PublicKeyCredentialRequestOptions
    const cred = (await navigator.credentials.get({
      publicKey: opts as unknown as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential
    const credential = {
      rawId: arrayBufferToB64(cred.rawId),
      id: cred.id,
      response: {
        clientDataJSON: arrayBufferToB64(
          (cred.response as AuthenticatorAssertionResponse).clientDataJSON,
        ),
        authenticatorData: arrayBufferToB64(
          (cred.response as AuthenticatorAssertionResponse).authenticatorData,
        ),
        signature: arrayBufferToB64((cred.response as AuthenticatorAssertionResponse).signature),
        userHandle: (cred.response as AuthenticatorAssertionResponse).userHandle
          ? arrayBufferToB64((cred.response as AuthenticatorAssertionResponse).userHandle!)
          : undefined,
      },
      type: cred.type,
    }
    const result = (await loginFinish.mutateAsync({
      userId: opts.userId,
      credential,
    })) as unknown as { token: string }
    await fetch("/api/auth/passkey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: result.token }),
    })
  }

  return { register, login, registerOptions, registerFinish, loginOptions, loginFinish }
}
