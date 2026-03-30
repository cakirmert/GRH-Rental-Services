/**
 * Check if passkey authentication is supported in the current browser
 * @returns Boolean indicating passkey support
 */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" && "credentials" in navigator && "create" in navigator.credentials
  )
}
