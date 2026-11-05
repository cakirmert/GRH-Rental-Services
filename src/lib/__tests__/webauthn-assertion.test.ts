// @vitest-environment node
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

describe("existing credential assertion compatibility", () => {
  it("verifies a signed legacy double-encoded credential and rejects wrong RP origin", async () => {
    vi.stubEnv("RP_ID", "example.com")
    vi.stubEnv("ORIGIN", "https://example.com")
    vi.resetModules()
    const { verifyAuthentication } = await import("../webauthn")
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    const jwk = publicKey.export({ format: "jwk" })
    // COSE EC2 key: kty=2, alg=-7, crv=1, x/y=P-256 public coordinates.
    const cose = Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
      Buffer.from(jwk.x!, "base64url"), Buffer.from([0x22, 0x58, 0x20]), Buffer.from(jwk.y!, "base64url"),
    ])
    const id = Buffer.from("unchanged-existing-credential-id").toString("base64url")
    const challenge = Buffer.from("single-use-cryptographic-challenge").toString("base64url")
    const assertion = (origin: string) => {
      const client = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin }))
      const counter = Buffer.alloc(4); counter.writeUInt32BE(4)
      const data = Buffer.concat([createHash("sha256").update("example.com").digest(), Buffer.from([0x05]), counter])
      const signature = sign("sha256", Buffer.concat([data, createHash("sha256").update(client).digest()]), privateKey)
      return { id, rawId: id, type: "public-key" as const, clientExtensionResults: {}, response: {
        clientDataJSON: client.toString("base64url"), authenticatorData: data.toString("base64url"),
        signature: signature.toString("base64url"), userHandle: Buffer.from("existing-user").toString("base64url"),
      } }
    }
    const stored = () => ({ credentialID: Buffer.from(id).toString("base64url"), credentialPublicKey: cose.toString("base64url"), counter: 3 })
    const valid = await verifyAuthentication(assertion("https://example.com"), challenge, stored())
    expect(valid.verified).toBe(true)
    expect(valid.authenticationInfo.newCounter).toBe(4)
    await expect(verifyAuthentication(assertion("https://attacker.example"), challenge, stored())).rejects.toThrow()
    await expect(verifyAuthentication(assertion("https://example.com"), "wrong-challenge", stored())).rejects.toThrow()
    vi.unstubAllEnvs()
  })
})
