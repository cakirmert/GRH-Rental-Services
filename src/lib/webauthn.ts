import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types"

const rpID = process.env.RP_ID!
const origin = process.env.ORIGIN!

const BASE64URL_PATTERN = /^[A-Za-z0-9\-_]+$/
const MIN_CREDENTIAL_ID_LENGTH = 16
const DEFAULT_TRANSPORT_HINTS: AuthenticatorTransportFuture[] = [
  "internal",
  "hybrid",
  "usb",
  "nfc",
  "ble",
]

/**
 * Convert assorted credential ID encodings into a normalized base64url string.
 * This also recovers IDs that were accidentally double-encoded when stored.
 */
export function normalizeCredentialId(id: string | null | undefined): string | null {
  if (!id) return null
  const trimmed = id.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  const candidate =
    normalized.length >= MIN_CREDENTIAL_ID_LENGTH && BASE64URL_PATTERN.test(normalized)
      ? normalized
      : null

  try {
    const decoded = Buffer.from(trimmed, "base64url").toString("utf8")
    const decodedNormalized = decoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    if (
      decodedNormalized.length >= MIN_CREDENTIAL_ID_LENGTH &&
      BASE64URL_PATTERN.test(decodedNormalized) &&
      decodedNormalized !== candidate
    ) {
      return decodedNormalized
    }
  } catch {
    /* Ignore decoding errors; fall through */
  }

  return candidate
}

export async function getRegistrationOptions(
  userId: string,
  username: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const userIdBuffer = new TextEncoder().encode(userId)

  return generateRegistrationOptions({
    rpName: "GRH Booking",
    rpID,
    timeout: 60_000,
    userID: userIdBuffer,
    userName: username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
    extensions: {
      credProps: true,
    },
  })
}

export async function verifyRegistration(
  credential: RegistrationResponseJSON,
  expectedChallenge: string,
) {
  return verifyRegistrationResponse({
    response: credential,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  })
}

export async function getAuthenticationOptions(
  allowCredentials: Array<{ id: string; transports?: AuthenticatorTransportFuture[] }>,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const processedCredentials = allowCredentials
    .map(({ id, transports }) => {
      const normalizedId = normalizeCredentialId(id)
      if (!normalizedId) return null

      const transportHints =
        transports && transports.length > 0 ? transports : DEFAULT_TRANSPORT_HINTS

      return { id: normalizedId, type: "public-key" as const, transports: transportHints }
    })
    .filter(
      (
        cred,
      ): cred is { id: string; type: "public-key"; transports: AuthenticatorTransportFuture[] } =>
        cred !== null,
    )

  return generateAuthenticationOptions({
    rpID,
    timeout: 60_000,
    userVerification: "required",
    allowCredentials: processedCredentials.length > 0 ? processedCredentials : undefined,
  })
}

export async function verifyAuthentication(
  credential: AuthenticationResponseJSON,
  expectedChallenge: string,
  authenticator: {
    credentialID: string
    credentialPublicKey: string
    counter: number
  },
) {
  const normalizedAuthenticatorID = normalizeCredentialId(authenticator.credentialID)
  if (!normalizedAuthenticatorID) {
    throw new Error(`Unable to normalize stored credential ID: ${authenticator.credentialID}`)
  }

  if (normalizedAuthenticatorID !== authenticator.credentialID) {
    authenticator.credentialID = normalizedAuthenticatorID
  }

  const normalizedCredentialID = normalizedAuthenticatorID
  const incomingCredentialId =
    normalizeCredentialId(credential.rawId) || normalizeCredentialId(credential.id)

  if (!incomingCredentialId) {
    throw new Error(`Unable to normalize incoming credential ID: ${credential.id}`)
  }

  const normalizedCredential = {
    ...credential,
    id: normalizedCredentialID,
    rawId: normalizedCredentialID,
  }

  const normalizedPublicKey = authenticator.credentialPublicKey
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  let publicKeyBuffer: Buffer
  try {
    publicKeyBuffer = Buffer.from(normalizedPublicKey, "base64url")
  } catch (e) {
    try {
      publicKeyBuffer = Buffer.from(authenticator.credentialPublicKey, "base64")
    } catch (e2) {
      throw new Error(`Failed to parse credentialPublicKey: ${authenticator.credentialPublicKey}`)
    }
  }

  return verifyAuthenticationResponse({
    response: normalizedCredential,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: normalizedCredentialID,
      publicKey: new Uint8Array(publicKeyBuffer),
      counter: authenticator.counter,
    },
  })
}
