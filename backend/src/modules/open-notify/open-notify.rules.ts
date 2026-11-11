// Pure rules for "notify me when open" (unit-tested).

/** Never schedule further out than this (bad clock / misconfigured hours guard). */
export const OPEN_NOTIFY_MAX_AHEAD_MS = 36 * 60 * 60 * 1000

export type AreaWindowForNotify = {
  isOpen: boolean
  opensAtEpochMs: number | null
  opensAtLabel: string | null
}

/** Decide what a subscribe request should do, given the area's service window. */
export function planOpenNotify(window: AreaWindowForNotify, now = Date.now()) {
  if (window.isOpen) return { kind: "already_open" as const }
  const at = window.opensAtEpochMs
  if (typeof at !== "number" || !Number.isFinite(at) || at <= now) {
    return { kind: "unknown_reopen" as const }
  }
  if (at - now > OPEN_NOTIFY_MAX_AHEAD_MS) return { kind: "unknown_reopen" as const }
  return { kind: "schedule" as const, notifyAt: new Date(at), opensAtLabel: window.opensAtLabel ?? "" }
}

/** Due rows: pending and their reopen time has arrived (small grace for clock skew). */
export function isOpenNotifyDue(notifyAt: Date | string, now = Date.now()) {
  const at = new Date(notifyAt).getTime()
  return Number.isFinite(at) && at <= now + 5_000
}

export function buildOpenNotifyPush() {
  return {
    title: "Foodbela is open now 🍛",
    body: "Restaurants near you are taking orders again. Tap to order before the rush!",
    data: { type: "open_notify", path: "/(tabs)", personalOffer: true },
  }
}
