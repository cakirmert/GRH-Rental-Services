// Passkey/WebAuthn configuration
export const passkeyConfig = {
  rpID: process.env.RP_ID!,
  rpName: process.env.RP_NAME!,
  origin: process.env.ORIGIN!,

  // Timeout for registration/authentication (in milliseconds)
  timeout: 60000,

  // Require user verification (PIN, biometric, etc.)
  userVerification: "preferred" as const,

  // Require resident key (device stores the credential)
  residentKey: "preferred" as const,

  // Attestation preference for registration
  attestation: "none" as const,
} as const

export type PasskeyConfig = typeof passkeyConfig
