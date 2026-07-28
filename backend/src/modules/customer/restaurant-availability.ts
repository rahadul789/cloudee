/**
 * Customer-facing "is this restaurant open, and if not, when does it open?" engine.
 *
 * Two DETERMINISTIC gates decide when a restaurant CAN be open — the platform/zone
 * service window and the restaurant's own weekly schedule — plus one NON-deterministic
 * signal, the owner's online toggle, and the admin enforcement state.
 *
 *   isOpen = serviceWindowOpen && ownerOnline && !restricted
 *
 * The schedule is a *predictor*, never a gate: when the owner is offline we use it to
 * show a friendly "Opens at 2:00 PM" instead of a bare "Temporarily unavailable". The
 * owner can always come online earlier (that just flips it open). Reopen time is always
 * computed here in Asia/Dhaka and handed to the client as `opensInSeconds`, so the app's
 * countdown is correct regardless of the device timezone.
 */

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
  weeklySchedule?: unknown
  exceptions?: unknown
} | null | undefined

function timeToMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const mins = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
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

  const clock = getDhakaClock(now)
  const nowSec = clock.secondOfDay

  // Open-now check (today's source, honouring slots that wrap past midnight).
  const today = resolveDaySource(openingHours, clock.weekday, clock.dateKey)
  let openNow = false
  if (today && today.isOpen) {
    if (today.is24Hours) {
      openNow = true
    } else {
      const nowMin = nowSec / 60
      openNow = normalizeSlots(today.timeSlots).some(
        (slot) => nowMin >= slot.start && nowMin < slot.end,
      )
    }
  }

  // Next-open scan: today's remaining slots, then following days' first slot.
  let nextOpen: ScheduleState["nextOpen"] = null
  const baseDate = new Date(now)
  for (let offset = 0; offset <= 7 && !nextOpen; offset += 1) {
    const probe = new Date(baseDate.getTime() + offset * SECONDS_PER_DAY * 1000)
    const probeClock = getDhakaClock(probe)
    const source = resolveDaySource(openingHours, probeClock.weekday, probeClock.dateKey)
    if (!source || !source.isOpen) continue
    if (source.is24Hours) {
      // Opens at 00:00 of that day — only meaningful for a future day.
      if (offset > 0) {
        nextOpen = { secondsUntil: offset * SECONDS_PER_DAY - nowSec, openMinute: 0, dayOffset: offset }
      }
      continue
    }
    for (const slot of normalizeSlots(source.timeSlots)) {
      const startSec = slot.start * 60
      const untilStart = offset * SECONDS_PER_DAY + startSec - nowSec
      if (untilStart > 0) {
        nextOpen = { secondsUntil: untilStart, openMinute: slot.start % (24 * 60), dayOffset: offset }
        break
      }
    }
  }

  return { hasSchedule: true, openNow, nextOpen }
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

  if (params.restricted) {
    return { isOpen: false, closedReason: "restricted", opensAtLabel: null, opensAtEpochMs: null, closesAtEpochMs: null }
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
