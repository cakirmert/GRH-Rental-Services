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
  return !previousDate || !isSameLocalDay(currentDate, previousDate)
}

export function formatChatMessageDate(
  value: unknown,
  locale: string,
  labels: ChatDateLabels,
  now = new Date(),
): string | null {
  const date = parseChatMessageDate(value)
  if (!date) return null

  if (isSameLocalDay(date, now)) return labels.today

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (isSameLocalDay(date, yesterday)) return labels.yesterday

  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date)
}

export function formatChatMessageTime(value: unknown, locale: string): string | null {
  const date = parseChatMessageDate(value)
  if (!date) return null

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
