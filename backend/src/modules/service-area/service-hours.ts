/**
 * Platform + per-zone "service window" — the hours during which customers may see
 * restaurants as open and place orders, layered ON TOP of each owner's own
 * online/offline toggle. Outside the window every restaurant in the zone is forced
 * closed regardless of the owner toggle.
 *
 * Timezone discipline (the one place this feature can silently break): the server
 * runs in UTC, so the current time-of-day MUST be derived through Intl in
 * Asia/Dhaka — never `new Date().getHours()`. This mirrors the existing Dhaka
 * helpers (`getDhakaHourDecimal`/`getDhakaHour`, `isHourWithinWindow`/
 * `isWithinQuietHours`) but works in whole minutes-of-day for boundary accuracy.
 *
 * Invariant: the OPEN/CLOSED decision is never cached — it flips with the wall
 * clock on its own. Only the hours *config* (open/close minutes) is cache-backed
 * upstream; `evaluate*` must run live per request.
 */

export const SERVICE_HOURS_TIMEZONE = "Asia/Dhaka"

const MINUTES_PER_DAY = 1440

/** Fully-resolved config (no nulls). Timezone lives at platform level only. */
export type ServiceHoursConfig = {
  enabled: boolean
  openMinute: number
  closeMinute: number
  timezone: string
}

/** Per-zone override: every field nullable, `null`/absent = inherit platform default. */
export type ServiceHoursOverride = {
  enabled?: boolean | null
  openMinute?: number | null
  closeMinute?: number | null
}

export type ServiceWindowState = {
  /** Whether the window feature is active for this scope. */
  enabled: boolean
  /** Live answer: is the platform serving right now? (true when disabled) */
  isOpen: boolean
  openMinute: number
  closeMinute: number
  timezone: string
  /** Current minute-of-day on the Dhaka clock (0..1439) — handy for banners. */
  nowMinute: number
}

/** 12:00–23:00 Asia/Dhaka. */
export const DEFAULT_PLATFORM_SERVICE_HOURS: ServiceHoursConfig = {
  enabled: true,
  openMinute: 12 * 60, // 720
  closeMinute: 23 * 60, // 1380
  timezone: SERVICE_HOURS_TIMEZONE,
}

function clampMinuteOfDay(value: number): number {
  if (!Number.isFinite(value)) return 0
  const normalized = Math.floor(value) % MINUTES_PER_DAY
  return normalized < 0 ? normalized + MINUTES_PER_DAY : normalized
}

/** Accept a stored minute (0..1440); anything else = "not set". 1440 = end of day. */
function coerceMinute(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < 0 || rounded > MINUTES_PER_DAY) return null
  return rounded
}

/**
 * Current minute-of-day (0..1439) on the Asia/Dhaka wall clock. Goes through Intl
 * so it is correct no matter what timezone the server process runs in.
 */
export function getDhakaMinuteOfDay(
  now: Date = new Date(),
  timeZone: string = SERVICE_HOURS_TIMEZONE,
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0")
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0")
  const safeHour = hour === 24 ? 0 : hour
  return clampMinuteOfDay(safeHour * 60 + minute)
}

/**
 * Wrap-aware window test. Mirrors `isHourWithinWindow`/`isWithinQuietHours`:
 * - close > open  → same-day window (e.g. 720→1380 = 12:00–23:00)
 * - close ≤ open  → wraps past midnight (e.g. 1380→120 = 23:00–02:00)
 * `closeMinute === 1440` means "end of day" and stays open through 23:59.
 * A zero-length window (open === close) is treated as always-open, never as a
 * silent full closure.
 */
export function isMinuteWithinWindow(
  nowMinute: number,
  openMinute: number,
  closeMinute: number,
): boolean {
  const now = clampMinuteOfDay(nowMinute)
  const open = clampMinuteOfDay(openMinute)
  const close =
    closeMinute >= MINUTES_PER_DAY ? MINUTES_PER_DAY : clampMinuteOfDay(closeMinute)

  if (open === close) return true
  if (close > open) return now >= open && now < close
  return now >= open || now < close
}

/** Merge a nullable zone override onto the resolved platform default. */
export function resolveServiceHoursConfig(
  override: ServiceHoursOverride | null | undefined,
  base: ServiceHoursConfig,
): ServiceHoursConfig {
  return {
    enabled: typeof override?.enabled === "boolean" ? override.enabled : base.enabled,
    openMinute: coerceMinute(override?.openMinute) ?? base.openMinute,
    closeMinute: coerceMinute(override?.closeMinute) ?? base.closeMinute,
    timezone: base.timezone || SERVICE_HOURS_TIMEZONE,
  }
}

/** Live evaluation of a fully-resolved config. */
export function evaluateServiceWindow(
  config: ServiceHoursConfig,
  now: Date = new Date(),
): ServiceWindowState {
  const timezone = config.timezone || SERVICE_HOURS_TIMEZONE
  const nowMinute = getDhakaMinuteOfDay(now, timezone)
  const isOpen = config.enabled
    ? isMinuteWithinWindow(nowMinute, config.openMinute, config.closeMinute)
    : true
  return {
    enabled: config.enabled,
    isOpen,
    openMinute: config.openMinute,
    closeMinute: config.closeMinute,
    timezone,
    nowMinute,
  }
}

/** Convenience: resolve a zone override against the platform default, then evaluate. */
export function evaluateServiceWindowForOverride(
  override: ServiceHoursOverride | null | undefined,
  base: ServiceHoursConfig,
  now: Date = new Date(),
): ServiceWindowState {
  return evaluateServiceWindow(resolveServiceHoursConfig(override, base), now)
}

/** "HH:MM" 24-hour label for a minute-of-day (1440 renders as 24:00). */
export function formatMinuteOfDay(minute: number): string {
  if (minute >= MINUTES_PER_DAY) return "24:00"
  const value = clampMinuteOfDay(minute)
  const hours = Math.floor(value / 60)
  const mins = value % 60
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

/**
 * 12-hour "h:MM AM/PM" label for owner-facing surfaces (720 → "12:00 PM",
 * 1380 → "11:00 PM", 0 and 1440 → "12:00 AM").
 */
export function formatMinuteOfDayLabel(minute: number): string {
  const value = clampMinuteOfDay(Math.round(minute)) // 1440 → 0 (midnight)
  const hour24 = Math.floor(value / 60)
  const mins = value % 60
  const period = hour24 < 12 ? "AM" : "PM"
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${String(mins).padStart(2, "0")} ${period}`
}
