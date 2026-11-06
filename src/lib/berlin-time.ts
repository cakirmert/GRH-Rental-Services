import { TZDate, tz, tzOffset } from "@date-fns/tz"
import { format, type FormatOptions } from "date-fns"

export const BERLIN_TIME_ZONE = "Europe/Berlin"
export const berlinContext = { in: tz(BERLIN_TIME_ZONE) }

/** Resolve civil fields independently of the host timezone. Choose the earlier
 * autumn occurrence; move missing spring times forward for recurring rules. */
export function berlinDateFromParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): TZDate {
  const civil = Date.UTC(year, month, day, hour, minute, second, millisecond)
  const offsets = new Set(
    [-36, 0, 36].map((hours) => tzOffset(BERLIN_TIME_ZONE, new Date(civil + hours * 3600000))),
  )
  const candidates = [...offsets].map((offset) => civil - offset * 60000)
  const exact = candidates.filter(
    (instant) => instant + tzOffset(BERLIN_TIME_ZONE, new Date(instant)) * 60000 === civil,
  )
  return new TZDate(exact.length ? Math.min(...exact) : Math.max(...candidates), BERLIN_TIME_ZONE)
}

/** Keep the instant, but perform calendar arithmetic in the rental site's timezone. */
export function toBerlinDate(value: Date | string | number = Date.now()): TZDate {
  const instant =
    value instanceof Date
      ? value.getTime()
      : typeof value === "string"
        ? new Date(value).getTime()
        : value
  return new TZDate(instant, BERLIN_TIME_ZONE)
}

export function formatInBerlin(
  value: Date | string | number,
  pattern: string,
  options?: FormatOptions,
): string {
  return format(toBerlinDate(value), pattern, { ...options, ...berlinContext })
}

export function formatBerlinDateTime(value: Date): string {
  return formatInBerlin(value, "yyyy-MM-dd'T'HH:mm")
}

/** Reject nonexistent spring-forward clock times instead of silently changing the selection. */
export function parseBerlinDateTime(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error("Enter a valid Berlin date and time.")
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  if (year < 1970 || year > 9999) throw new Error("Enter a valid Berlin date and time.")
  const date = berlinDateFromParts(year, month - 1, day, hour, minute)
  if (!Number.isFinite(date.getTime()) || formatBerlinDateTime(date) !== value) {
    throw new Error("This Berlin date or time does not exist. Choose another time.")
  }
  return new Date(date.getTime())
}

export function combineBerlinDateAndTime(day: Date, time: string): Date {
  return parseBerlinDateTime(`${formatInBerlin(day, "yyyy-MM-dd")}T${time}`)
}
