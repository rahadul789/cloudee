// Win-back ("we miss you") rules — pure, unit-tested. No database access here.
import crypto from "node:crypto"

export type WinBackSegment = "one_time" | "regular" | "loyal"

export const WIN_BACK_SEGMENTS: WinBackSegment[] = ["loyal", "regular", "one_time"]

/** 1 order = tried once · 2–4 = was a regular · 5+ = loyal. */
export function segmentForOrderCount(deliveredOrders: number): WinBackSegment {
  if (deliveredOrders >= 5) return "loyal"
  if (deliveredOrders >= 2) return "regular"
  return "one_time"
}

/**
 * Stable "control group" pick: the same customer is always in or out (hash of the id), so
 * we can compare people who got nothing with people who got a voucher.
 */
export function isControlCustomer(customerId: string, controlPercent: number) {
  if (!controlPercent || controlPercent <= 0) return false
  const bucket = crypto.createHash("sha256").update(`win-back:${customerId}`).digest().readUInt16BE(0) % 100
  return bucket < Math.min(50, controlPercent)
}

export type WinBackEligibilityInput = {
  now: number
  lastOrderAt: number
  /** Days without an order before we try to win them back. */
  lapsedDays: number
  /** When earlier win-back vouchers (or control picks) happened for this customer. */
  previousAttemptsAt: number[]
  /** Max attempts in 90 days (default 2). */
  maxAttemptsPer90Days: number
}

const DAY = 24 * 60 * 60 * 1000
/** Never try the same person twice within this gap (voucher lives 7 days + a week to think). */
export const WIN_BACK_MIN_GAP_DAYS = 14

export function checkWinBackEligibility(input: WinBackEligibilityInput) {
  const daysSinceOrder = Math.floor((input.now - input.lastOrderAt) / DAY)
  if (daysSinceOrder < input.lapsedDays) return { eligible: false as const, reason: "still_active" as const, daysSinceOrder }
  // Attempts made BEFORE their latest order don't count — ordering again resets the cycle.
  const attempts = input.previousAttemptsAt.filter((at) => at > input.lastOrderAt)
  const recent = attempts.filter((at) => input.now - at < 90 * DAY)
  if (recent.length >= input.maxAttemptsPer90Days) {
    return { eligible: false as const, reason: "limit_reached" as const, daysSinceOrder }
  }
  const lastAttempt = attempts.length ? Math.max(...attempts) : 0
  if (lastAttempt && input.now - lastAttempt < WIN_BACK_MIN_GAP_DAYS * DAY) {
    return { eligible: false as const, reason: "recently_tried" as const, daysSinceOrder }
  }
  return { eligible: true as const, reason: null, daysSinceOrder }
}

/** Most valuable first (loyal → regular → one-time), then longest away. */
export function sortByPriority<T extends { segment: WinBackSegment; daysSinceOrder: number }>(rows: T[]) {
  const rank: Record<WinBackSegment, number> = { loyal: 0, regular: 1, one_time: 2 }
  return [...rows].sort(
    (left, right) => rank[left.segment] - rank[right.segment] || right.daysSinceOrder - left.daysSinceOrder,
  )
}

/** Keep the batch inside what's left of this month's budget (face value of vouchers). */
export function fitToBudget<T extends { amount: number }>(rows: T[], remainingBudget: number) {
  const picked: T[] = []
  let spent = 0
  for (const row of rows) {
    if (spent + row.amount > remainingBudget) continue
    picked.push(row)
    spent += row.amount
  }
  return { picked, spent, skipped: rows.length - picked.length }
}

export function buildWinBackMessage(params: {
  amount: number
  favouriteRestaurantName: string
  validityDays: number
  minOrder: number
}) {
  const place = params.favouriteRestaurantName.trim()
  return {
    title: "We miss you! 🍛",
    body: place
      ? `${place} misses you — here's ৳${params.amount} off your next order (min ৳${params.minOrder}). Valid ${params.validityDays} days.`
      : `Here's ৳${params.amount} off your next order (min ৳${params.minOrder}). Valid ${params.validityDays} days.`,
  }
}

/** Dhaka (UTC+6) date key + minute of day — for the once-a-day auto send. */
export function dhakaClock(now = Date.now()) {
  const shifted = new Date(now + 6 * 60 * 60 * 1000)
  return {
    dateKey: shifted.toISOString().slice(0, 10),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}
