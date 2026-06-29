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
 */
export function normalizeCredentialId(id: string | null | undefined): string | null {
  if (!id) return null
  const trimmed = id.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return normalized.length >= MIN_CREDENTIAL_ID_LENGTH && BASE64URL_PATTERN.test(normalized)
    ? normalized
    : null
}

/**
 * Return valid credential ID candidates, including legacy records that were
 * accidentally stored as base64url(base64url(id)).
 */
export function getCredentialIdCandidates(id: string | null | undefined): string[] {
  const candidate = normalizeCredentialId(id)
  if (!candidate) return []
  const candidates = [candidate]

  try {
    const decoded = Buffer.from(candidate, "base64url").toString("utf8").trim()
    const decodedNormalized = normalizeCredentialId(decoded)
    if (decodedNormalized && decodedNormalized !== candidate) {
      candidates.push(decodedNormalized)
    }
  } catch {
    /* Ignore decoding errors; only the original candidate is valid */
  }

  return Array.from(new Set(candidates))
}

function credentialIdsMatch(storedId: string, incomingId: string) {
  return getCredentialIdCandidates(storedId).includes(incomingId)
}

function getPreferredCredentialId(storedId: string, incomingId: string) {
  return credentialIdsMatch(storedId, incomingId) ? incomingId : normalizeCredentialId(storedId)
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
  const processedCredentials = allowCredentials.flatMap(({ id, transports }) => {
    const candidateIds = getCredentialIdCandidates(id)
    if (candidateIds.length === 0) return []
    const transportHints =
      transports && transports.length > 0 ? transports : DEFAULT_TRANSPORT_HINTS

    return candidateIds.map((candidateId) => ({
      id: candidateId,
      type: "public-key" as const,
      transports: transportHints,
    }))
  })

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
  const incomingCredentialId =
    normalizeCredentialId(credential.rawId) || normalizeCredentialId(credential.id)

  if (!incomingCredentialId) {
    throw new Error(`Unable to normalize incoming credential ID: ${credential.id}`)
  }

  const normalizedStoredID = getPreferredCredentialId(
    authenticator.credentialID,
    incomingCredentialId,
  )
  if (!normalizedStoredID) {
    throw new Error(`Unable to normalize stored credential ID: ${authenticator.credentialID}`)
  }

  if (authenticator.credentialID !== normalizedStoredID) {
    authenticator.credentialID = normalizedStoredID
  }

  const normalizedCredential = {
    ...credential,
    id: normalizedStoredID,
    rawId: normalizedStoredID,
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
      id: normalizedStoredID,
      publicKey: new Uint8Array(publicKeyBuffer),
      counter: authenticator.counter,
    },
  })
}
