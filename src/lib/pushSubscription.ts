import { isIP } from "node:net"

type BrowserPushSubscription = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

type StoredPushSubscription = {
  endpoint: string
  expirationTime?: number | null
  p256dh: string
  auth: string
}

const ALLOWED_PUSH_ENDPOINT_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "updates-autopush.stage.mozaws.net",
  "web.push.apple.com",
])

const ALLOWED_PUSH_ENDPOINT_SUFFIXES = [".push.apple.com", ".notify.windows.com"]

function isPrivateOrLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase()
  if (
    normalized === "localhost" ||
    normalized === "localhost.localdomain" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true
  }

  const ipVersion = isIP(normalized)
  if (ipVersion === 4) {
    const [a = 0, b = 0] = normalized.split(".").map((part) => Number(part))
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }

  if (ipVersion === 6) {
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    )
  }

  return false
}

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)
    if (url.protocol !== "https:") return false

    const hostname = url.hostname.toLowerCase()
    if (isPrivateOrLocalHostname(hostname)) return false

    return (
      ALLOWED_PUSH_ENDPOINT_HOSTS.has(hostname) ||
      ALLOWED_PUSH_ENDPOINT_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
    )
  } catch {
    return false
  }
}

export function assertValidPushSubscription(sub: BrowserPushSubscription) {
  if (!isAllowedPushEndpoint(sub.endpoint)) {
    throw new Error("Unsupported push subscription endpoint.")
  }
  if (!sub.keys.p256dh || !sub.keys.auth) {
    throw new Error("Invalid push subscription keys.")
  }
}

export function toWebPushSubscription(sub: StoredPushSubscription) {
  if (!isAllowedPushEndpoint(sub.endpoint)) {
    return null
  }

  return {
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime ?? undefined,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  }
}
