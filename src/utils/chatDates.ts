import { BERLIN_TIME_ZONE, toBerlinDate } from "@/lib/berlin-time"

export type ChatDateLabels = {
  today: string
  yesterday: string
}

export function parseChatMessageDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

export function shouldShowChatDateDivider(
  currentCreatedAt: unknown,
  previousCreatedAt: unknown,
): boolean {
  const currentDate = parseChatMessageDate(currentCreatedAt)
  if (!currentDate) return false

  const previousDate = parseChatMessageDate(previousCreatedAt)
  return !previousDate || !isSameBerlinDay(currentDate, previousDate)
}

export function formatChatMessageDate(
  value: unknown,
  locale: string,
  labels: ChatDateLabels,
  now = new Date(),
): string | null {
  const date = parseChatMessageDate(value)
  if (!date) return null

  if (isSameBerlinDay(date, now)) return labels.today

  const yesterday = toBerlinDate(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameBerlinDay(date, yesterday)) return labels.yesterday

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: BERLIN_TIME_ZONE,
  }).format(date)
}

export function formatChatMessageTime(value: unknown, locale: string): string | null {
  const date = parseChatMessageDate(value)
  if (!date) return null

  return new Intl.DateTimeFormat(locale, {
    timeZone: BERLIN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function isSameBerlinDay(a: Date, b: Date): boolean {
  const berlinA = toBerlinDate(a)
  const berlinB = toBerlinDate(b)
  return (
    berlinA.getFullYear() === berlinB.getFullYear() &&
    berlinA.getMonth() === berlinB.getMonth() &&
    berlinA.getDate() === berlinB.getDate()
  )
}
