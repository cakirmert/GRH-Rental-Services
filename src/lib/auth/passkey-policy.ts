import { TRPCError } from "@trpc/server"

/** A preview sharing the live RP may authenticate, but must not replace a device credential. */
export function assertPasskeyManagementAllowed() {
  if (process.env.GRH_PASSKEY_SIGNIN_ONLY === "true") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This preview supports existing passkeys for sign-in only. Manage passkeys on the live website.",
    })
  }
}
