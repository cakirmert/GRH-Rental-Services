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
  // Convert userId string to Uint8Array
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
  console.log(
    "🔐 Getting authentication options for credentials:",
    allowCredentials.map((cred) => cred.id),
  )

  const processedCredentials = allowCredentials
    .map(({ id, transports }) => {
      console.log(`🔍 Processing credential ID: "${id}" (length: ${id?.length})`)

      const normalizedId = normalizeCredentialId(id)
      if (!normalizedId) {
        console.warn("⚠️ Failed to normalize credential ID:", id)
        return null
      }

      const transportHints =
        transports && transports.length > 0 ? transports : DEFAULT_TRANSPORT_HINTS

      console.log(`✅ Using credential ID: ${normalizedId.substring(0, 20)}...`, {
        transports: transportHints,
      })

      return { id: normalizedId, type: "public-key" as const, transports: transportHints }
    })
    .filter((cred): cred is { id: string; type: "public-key"; transports: AuthenticatorTransportFuture[] } => cred !== null)

  console.log(
    `📋 Successfully processed ${processedCredentials.length}/${allowCredentials.length} credentials`,
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
  console.log("🔐 Verifying authentication with:", {
    credentialID: authenticator.credentialID,
    credentialPublicKey: authenticator.credentialPublicKey?.substring(0, 20) + "...",
    counter: authenticator.counter,
  })

  const normalizedAuthenticatorID = normalizeCredentialId(authenticator.credentialID)
  if (!normalizedAuthenticatorID) {
    throw new Error(`Unable to normalize stored credential ID: ${authenticator.credentialID}`)
  }

  if (normalizedAuthenticatorID !== authenticator.credentialID) {
    console.log(
      `🔄 Updating stored credential ID "${authenticator.credentialID}" -> "${normalizedAuthenticatorID}"`,
    )
    authenticator.credentialID = normalizedAuthenticatorID
  }

  // Normalize credential ID to base64url format (no padding)
  const normalizedCredentialID = normalizedAuthenticatorID
  console.log(`🔄 Normalized credentialID: "${authenticator.credentialID}" -> "${normalizedCredentialID}"`)

  // Normalize the credential response itself to ensure all fields are base64url
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

  if (incomingCredentialId !== normalizedCredentialID) {
    console.log("⚠️ Incoming credential ID differs from stored value", {
      incomingCredentialId,
      normalizedCredentialID,
    })
  }

  console.log("🔧 Normalized credential for verification:", {
    originalId: credential.id,
    normalizedId: normalizedCredential.id,
    rawId: normalizedCredential.rawId,
  })

  // Normalize public key to base64url format (no padding)
  const normalizedPublicKey = authenticator.credentialPublicKey
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  console.log(
    `🔄 Normalized publicKey: "${authenticator.credentialPublicKey.substring(0, 20)}..." -> "${normalizedPublicKey.substring(0, 20)}..."`,
  )

  let publicKeyBuffer: Buffer
  try {
    console.log("🔧 Trying to parse normalized publicKey as base64url")
    publicKeyBuffer = Buffer.from(normalizedPublicKey, "base64url")
    console.log("✅ publicKey parsed as base64url successfully")
  } catch (e) {
    console.log("⚠️ Failed to parse publicKey as base64url, trying base64:", e)
    try {
      publicKeyBuffer = Buffer.from(authenticator.credentialPublicKey, "base64")
      console.log("✅ publicKey parsed as base64 successfully")
    } catch (e2) {
      console.log("❌ Failed to parse publicKey as both base64url and base64:", e2)
      throw new Error(`Failed to parse credentialPublicKey: ${authenticator.credentialPublicKey}`)
    }
  }
  try {
    console.log("🔧 Calling verifyAuthenticationResponse...")
    console.log("🔍 Credential response structure:", {
      id: credential.id,
      rawId: credential.rawId,
      type: credential.type,
      responseKeys: Object.keys(credential.response || {}),
      responseClientDataJSON: credential.response?.clientDataJSON?.substring(0, 50) + "...",
      responseAuthenticatorData: credential.response?.authenticatorData?.substring(0, 50) + "...",
      responseSignature: credential.response?.signature?.substring(0, 50) + "...",
    })

    console.log("🔍 Normalized credential structure:", {
      id: normalizedCredential.id,
      rawId: normalizedCredential.rawId,
      type: normalizedCredential.type,
      responseKeys: Object.keys(normalizedCredential.response || {}),
      responseClientDataJSON:
        normalizedCredential.response?.clientDataJSON?.substring(0, 50) + "...",
      responseAuthenticatorData:
        normalizedCredential.response?.authenticatorData?.substring(0, 50) + "...",
      responseSignature: normalizedCredential.response?.signature?.substring(0, 50) + "...",
    })
    const result = await verifyAuthenticationResponse({
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
    console.log("✅ verifyAuthenticationResponse completed successfully")
    return result
  } catch (e) {
    console.log("❌ verifyAuthenticationResponse failed:", e)
    console.log("🔍 Error details:", {
      message: (e as Error).message,
      stack: (e as Error).stack?.split("\n").slice(0, 5).join("\n"),
    })
    throw e
  }
}
