import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types"

const rpID = process.env.RP_ID!
const origin = process.env.ORIGIN!

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
      userVerification: "required",
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
  allowCredentials: string[],
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  console.log("🔐 Getting authentication options for credentials:", allowCredentials)
  const processedCredentials = allowCredentials
    .map((id) => {
      console.log(`🔍 Processing credential ID: "${id}" (length: ${id?.length})`)

      if (!id || typeof id !== "string") {
        console.warn("⚠️ Invalid credential ID (empty or not string):", id)
        return null
      }

      // Normalize to base64url format (remove padding and convert chars)
      const normalizedId = id.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
      console.log(`🔄 Normalized credential ID: "${id}" -> "${normalizedId}"`)

      try {
        // In the new API, we use the string directly, not a Buffer
        console.log(
          `✅ Using credential ID directly: ${normalizedId.substring(0, 20)}...`,
        )
        return { id: normalizedId, type: "public-key" as const }
      } catch (e) {
        console.error("❌ Failed to process credential ID:", normalizedId, e)
        return null
      }
    })
    .filter((cred) => cred !== null)

  console.log(
    `📋 Successfully processed ${processedCredentials.length}/${allowCredentials.length} credentials`,
  )

  if (processedCredentials.length === 0) {
    console.warn("⚠️ No valid credentials to process")
    // Return empty allowCredentials for usernameless discovery
    return generateAuthenticationOptions({
      rpID,
      timeout: 60_000,
      userVerification: "required",
      allowCredentials: [],
    })
  }

  return generateAuthenticationOptions({
    rpID,
    timeout: 60_000,
    userVerification: "required",
    allowCredentials: processedCredentials,
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

  // Normalize credential ID to base64url format (no padding)
  const normalizedCredentialID = authenticator.credentialID
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  console.log(
    `🔄 Normalized credentialID: "${authenticator.credentialID}" -> "${normalizedCredentialID}"`,
  )

  // Normalize the credential response itself to ensure all fields are base64url
  const normalizedCredential = {
    ...credential,
    id: normalizedCredentialID, // Ensure the credential ID matches our stored one
    rawId: normalizedCredentialID,
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
