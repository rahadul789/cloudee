/** Shared availability policy: manual owner control or opt-in schedule automation. */
import {
  formatMinuteOfDayLabel,
  getDhakaMinuteOfDay,
  isMinuteWithinWindow,
  SERVICE_HOURS_TIMEZONE,
  type ServiceHoursConfig,
} from "../service-area/service-hours"

const SECONDS_PER_DAY = 86_400
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const

export type RestaurantClosedReason =
  | "restricted"
  | "service_window"
  | "schedule"
  | "owner_busy"

export type RestaurantAvailability = {
  isOpen: boolean
  closedReason: RestaurantClosedReason | null
  /** Human label of the next open time, e.g. "11:00 AM" / "Tomorrow 2:00 PM". */
  opensAtLabel: string | null
  /**
   * Absolute epoch-ms of the next open (Dhaka-computed, then made absolute). null when
   * the reopen is unknown. Absolute so it survives response caching AND device-timezone
   * differences — the app just does `opensAtEpochMs - Date.now()` for its countdown.
   */
  opensAtEpochMs: number | null
  /**
   * Absolute epoch-ms of when the CURRENT open window closes — set only while open (else null),
   * and only for a real bounded window (a per-zone service window that isn't 24h/always-open).
   * Drives the "Closing in Xm Ys" urgency countdown; same absolute-epoch design as opensAtEpochMs.
   */
  closesAtEpochMs: number | null
}

type LooseTimeSlot = { startTime?: unknown; endTime?: unknown }
type LooseDay = {
  day?: unknown
  date?: unknown
  isOpen?: unknown
  is24Hours?: unknown
  timeSlots?: unknown
}
export type OpeningHoursInput = {
  timezone?: string
  adminPaused?: boolean
  automationMode?: "manual" | "auto"
  temporaryClosure?: { isPaused?: boolean; resumeAt?: Date | string | null; mode?: string | null; reason?: string } | null
  weeklySchedule?: unknown
  exceptions?: unknown
} | null | undefined

function timeToMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const mins = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours > 23 || mins > 59) return null
  return hours * 60 + mins
}

// Reused across the per-row schedule scan (listing enrich can call this many times).
const dhakaClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SERVICE_HOURS_TIMEZONE,
  weekday: "long",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

/** Current Asia/Dhaka wall clock broken into the pieces the schedule scan needs. */
export function getDhakaClock(now: Date = new Date()) {
  const parts = dhakaClockFormatter.formatToParts(now)
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ""
  const hour = Number(get("hour")) % 24
  const minute = Number(get("minute"))
  const second = Number(get("second"))
  return {
    weekday: get("weekday").toLowerCase(),
    dayIndex: WEEKDAYS.indexOf(get("weekday").toLowerCase() as (typeof WEEKDAYS)[number]),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    secondOfDay: hour * 3600 + minute * 60 + second,
  }
}

function normalizeSlots(raw: unknown): Array<{ start: number; end: number }> {
  if (!Array.isArray(raw)) return []
  const slots: Array<{ start: number; end: number }> = []
  for (const item of raw as LooseTimeSlot[]) {
    const start = timeToMinutes(item?.startTime)
    const endRaw = timeToMinutes(item?.endTime)
    if (start === null || endRaw === null) continue
    // endTime <= startTime means the slot wraps past midnight (e.g. 22:00 → 02:00).
    const end = endRaw <= start ? endRaw + 24 * 60 : endRaw
    slots.push({ start, end })
  }
  return slots.sort((a, b) => a.start - b.start)
}

// The schedule source for a given day: a date-specific exception wins over the weekly row.
function resolveDaySource(
  openingHours: NonNullable<OpeningHoursInput>,
  weekday: string,
  dateKey: string,
): LooseDay | null {
  const exceptions = Array.isArray(openingHours.exceptions)
    ? (openingHours.exceptions as LooseDay[])
    : []
  const exception = exceptions.find((entry) => entry?.date === dateKey)
  if (exception) return exception
  const weekly = Array.isArray(openingHours.weeklySchedule)
    ? (openingHours.weeklySchedule as LooseDay[])
    : []
  return weekly.find((entry) => entry?.day === weekday) ?? null
}

type ScheduleState = {
  hasSchedule: boolean
  openNow: boolean
  /** Next open as { seconds until, minute-of-day of the opening, day offset }. */
  nextOpen: { secondsUntil: number; openMinute: number; dayOffset: number } | null
}

/**
 * Evaluate the restaurant's own weekly schedule at `now`: is it scheduled-open right
 * now, and if not, when is the next opening (scanning up to 7 days for a cross-day
 * answer). Returns hasSchedule=false when nothing usable is configured — callers then
 * fall back to a generic closed state rather than inventing a time.
 */
export function evaluateSchedule(
  openingHours: OpeningHoursInput,
  now: Date = new Date(),
): ScheduleState {
  if (!openingHours) return { hasSchedule: false, openNow: false, nextOpen: null }
  const weekly = Array.isArray(openingHours.weeklySchedule)
    ? openingHours.weeklySchedule
    : []
  const exceptions = Array.isArray(openingHours.exceptions)
    ? openingHours.exceptions
    : []
  if (weekly.length === 0 && exceptions.length === 0) {
    return { hasSchedule: false, openNow: false, nextOpen: null }
  }

  const windows = getScheduleWindows(openingHours, now)
  const openNow = windows.some(([start, end]) => now.getTime() >= start && now.getTime() < end)
  const next = windows.find(([start]) => start > now.getTime())
  const clock = getDhakaClock(now)
  const nextClock = next ? getDhakaClock(new Date(next[0])) : null
  const nextOpen = next && nextClock ? {
    secondsUntil: (next[0] - now.getTime()) / 1000,
    openMinute: Math.floor(nextClock.secondOfDay / 60),
    dayOffset: Math.round((Date.parse(nextClock.dateKey) - Date.parse(clock.dateKey)) / 86400000),
  } : null

  return { hasSchedule: true, openNow, nextOpen }
}

type Window = [number, number]
const DAY_MS = 86400000

function mergeWindows(windows: Window[]): Window[] {
  const result: Window[] = []
  for (const [start, end] of windows.sort((a, b) => a[0] - b[0])) {
    const last = result[result.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else result.push([start, end])
  }
  return result
}

/** Yesterday is included for overnight shifts. A date exception replaces the whole
 * calendar date, including carry from yesterday; a weekly day off allows that carry. */
export function getScheduleWindows(hours: OpeningHoursInput, now = new Date()): Window[] {
  if (!hours) return []
  const midnight = Date.parse(`${getDhakaClock(now).dateKey}T00:00:00+06:00`)
  const windows: Window[] = []
  for (let offset = -1; offset <= 8; offset++) {
    const base = midnight + offset * DAY_MS
    const clock = getDhakaClock(new Date(base))
    const source = resolveDaySource(hours, clock.weekday, clock.dateKey)
    if (!source?.isOpen) continue
    const slots = source.is24Hours ? [{ start: 0, end: 1440 }] : normalizeSlots(source.timeSlots)
    const nextDate = getDhakaClock(new Date(base + DAY_MS)).dateKey
    const nextHasException = Array.isArray(hours.exceptions) &&
      (hours.exceptions as LooseDay[]).some((entry) => entry?.date === nextDate)
    for (const slot of slots) {
      const end = nextHasException ? Math.min(slot.end, 1440) : slot.end
      windows.push([base + slot.start * 60000, base + end * 60000])
    }
  }
  return mergeWindows(windows)
}

function computeAutoAvailability(hours: NonNullable<OpeningHoursInput>, service: ServiceHoursConfig, now: Date): RestaurantAvailability {
  const closed: RestaurantAvailability = { isOpen: false, closedReason: "schedule", opensAtLabel: null, opensAtEpochMs: null, closesAtEpochMs: null }
  const pause = hours.temporaryClosure
  const resume = pause?.resumeAt ? new Date(pause.resumeAt).getTime() : NaN
  const paused = pause?.isPaused && (!Number.isFinite(resume) || resume > now.getTime())
  if (paused && !Number.isFinite(resume)) return { ...closed, closedReason: "owner_busy" }
  const earliest = paused ? resume : now.getTime()
  const schedule = getScheduleWindows(hours, now)
  const platform: Window[] = []
  const midnight = Date.parse(`${getDhakaClock(now).dateKey}T00:00:00+06:00`)
  if (!service.enabled || service.openMinute === service.closeMinute) platform.push([-Infinity, Infinity])
  else for (let day = -1; day <= 9; day++) {
    const base = midnight + day * DAY_MS
    const end = service.closeMinute > service.openMinute ? service.closeMinute : service.closeMinute + 1440
    platform.push([base + service.openMinute * 60000, base + end * 60000])
  }
  const effective: Window[] = []
  for (const [start, end] of schedule) for (const [ps, pe] of platform) {
    const left = Math.max(start, ps, earliest), right = Math.min(end, pe)
    if (left < right) effective.push([left, right])
  }
  const windows = mergeWindows(effective)
  const current = windows.find(([start, end]) => start <= now.getTime() && now.getTime() < end)
  if (current) return { ...closed, isOpen: true, closedReason: null, closesAtEpochMs: current[1] >= midnight + 8 * DAY_MS ? null : current[1] }
  const next = windows.find(([start]) => start > now.getTime())
  if (paused) closed.closedReason = "owner_busy"
  else if (service.enabled && !isMinuteWithinWindow(getDhakaMinuteOfDay(now), service.openMinute, service.closeMinute)) closed.closedReason = "service_window"
  if (!next) return closed
  const nextClock = getDhakaClock(new Date(next[0]))
  const offset = Math.round((Date.parse(nextClock.dateKey) - Date.parse(getDhakaClock(now).dateKey)) / DAY_MS)
  return { ...closed, opensAtEpochMs: next[0], opensAtLabel: labelForDayOffset(Math.floor(nextClock.secondOfDay / 60), offset) }
}

function labelForDayOffset(openMinute: number, dayOffset: number): string {
  const time = formatMinuteOfDayLabel(openMinute)
  if (dayOffset === 0) return time
  if (dayOffset === 1) return `Tomorrow ${time}`
  return time
}

/** Seconds from now until the given Dhaka minute-of-day (today or next day). */
function secondsUntilDhakaMinute(openMinute: number, now: Date): number {
  const nowSec = getDhakaClock(now).secondOfDay
  const target = openMinute * 60
  return ((target - nowSec) % SECONDS_PER_DAY + SECONDS_PER_DAY) % SECONDS_PER_DAY
}

/**
 * The full customer-facing availability for one restaurant. Precedence:
 * restricted → service window → (owner offline: schedule predictor → busy).
 */
export function computeRestaurantAvailability(params: {
  serviceHours: ServiceHoursConfig
  isOnline: boolean
  restricted: boolean
  openingHours: OpeningHoursInput
  now?: Date
}): RestaurantAvailability {
  const now = params.now ?? new Date()

  if (params.restricted || params.openingHours?.adminPaused) {
    return { isOpen: false, closedReason: "restricted", opensAtLabel: null, opensAtEpochMs: null, closesAtEpochMs: null }
  }

  if (params.openingHours?.automationMode === "auto") {
    return computeAutoAvailability(params.openingHours, params.serviceHours, now)
  }

  const windowOpen =
    !params.serviceHours.enabled ||
    isMinuteWithinWindow(
      getDhakaMinuteOfDay(now, params.serviceHours.timezone),
      params.serviceHours.openMinute,
      params.serviceHours.closeMinute,
    )

  // Deterministic, area-wide: the platform/zone window is closed.
  if (!windowOpen) {
    return {
      isOpen: false,
      closedReason: "service_window",
      opensAtLabel: formatMinuteOfDayLabel(params.serviceHours.openMinute),
      opensAtEpochMs:
        now.getTime() +
        secondsUntilDhakaMinute(params.serviceHours.openMinute, now) * 1000,
      closesAtEpochMs: null,
    }
  }

  if (params.isOnline) {
    // Open now — surface when THIS window closes so the app can show a "Closing in …" urgency
    // countdown. Only for a real bounded service window (enabled and not 24h/always-open, where
    // openMinute === closeMinute means always-open); otherwise there is no close instant.
    const closesAtEpochMs =
      params.serviceHours.enabled &&
      params.serviceHours.openMinute !== params.serviceHours.closeMinute
        ? now.getTime() +
          secondsUntilDhakaMinute(params.serviceHours.closeMinute, now) * 1000
        : null
    return {
      isOpen: true,
      closedReason: null,
      opensAtLabel: null,
      opensAtEpochMs: null,
      closesAtEpochMs,
    }
  }

  // Window is open but the owner is offline. Predict the reopen from the schedule when
  // the restaurant is currently outside its own hours; otherwise it's a manual pause.
  const schedule = evaluateSchedule(params.openingHours, now)
  if (schedule.hasSchedule && !schedule.openNow && schedule.nextOpen) {
    return {
      isOpen: false,
      closedReason: "schedule",
      opensAtLabel: labelForDayOffset(
        schedule.nextOpen.openMinute,
        schedule.nextOpen.dayOffset,
      ),
      opensAtEpochMs: now.getTime() + schedule.nextOpen.secondsUntil * 1000,
      closesAtEpochMs: null,
    }
  }

  return { isOpen: false, closedReason: "owner_busy", opensAtLabel: null, opensAtEpochMs: null, closesAtEpochMs: null }
}
