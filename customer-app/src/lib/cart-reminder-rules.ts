// "Your cart is waiting" reminder — the anti-annoyance rules (pure; unit-tested).
//
// One gentle nudge, never a stream:
//  • only if the cart still has items (ordering or emptying it cancels the reminder)
//  • 60 minutes after the LAST cart change (still browsing → it keeps moving later);
//    reopening the app later never creates a fresh one for an old cart
//  • at most 1 per 24 hours and 2 per 7 days
//  • never in quiet hours (23:00–10:00 on the phone) and never after Foodbela closes
//  • off when the customer turned off promotional notifications

export const CART_REMINDER_DELAY_MS = 60 * 60 * 1000;
export const CART_REMINDER_MIN_GAP_MS = 24 * 60 * 60 * 1000;
export const CART_REMINDER_MAX_PER_WEEK = 2;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const QUIET_START_HOUR = 23;
const QUIET_END_HOUR = 10;
/** Don't fire in the last 15 minutes before the area closes (no time to order). */
const CLOSING_BUFFER_MS = 15 * 60 * 1000;

export type CartReminderInput = {
  now: number;
  hasItems: boolean;
  /** Last time any cart changed (ms). */
  lastChangeAt: number;
  /** When earlier reminders actually fired (ms). */
  sentAts: number[];
  /** Area service window close time, if known (ms). */
  closesAtEpochMs?: number | null;
  /** Customer's promotional-notification preference (undefined = on). */
  promotionsEnabled?: boolean;
  /** Hour-of-day resolver (local); injectable for tests. */
  hourOf?: (epochMs: number) => number;
};

export function isQuietHour(hour: number) {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** When to fire the reminder, or null when it must not be sent. */
export function planCartReminder(input: CartReminderInput): number | null {
  if (!input.hasItems || input.promotionsEnabled === false) return null;
  const dueAt = input.lastChangeAt + CART_REMINDER_DELAY_MS;
  // One nudge per cart change: if its moment already passed (e.g. app reopened hours
  // later), don’t invent a new one — only a fresh cart change can schedule again.
  if (dueAt < input.now) return null;
  const fireAt = Math.max(dueAt, input.now + 60 * 1000);

  const recent = input.sentAts.filter((at) => input.now - at < WEEK_MS);
  if (recent.length >= CART_REMINDER_MAX_PER_WEEK) return null;
  const lastSent = recent.length ? Math.max(...recent) : 0;
  if (lastSent && fireAt - lastSent < CART_REMINDER_MIN_GAP_MS) return null;

  const hourOf = input.hourOf ?? ((epochMs: number) => new Date(epochMs).getHours());
  if (isQuietHour(hourOf(fireAt))) return null;

  if (
    typeof input.closesAtEpochMs === "number" &&
    Number.isFinite(input.closesAtEpochMs) &&
    input.closesAtEpochMs > input.now &&
    fireAt > input.closesAtEpochMs - CLOSING_BUFFER_MS
  ) {
    return null;
  }
  return fireAt;
}

/** "Kacchi Bhai: Chicken Kacchi + 2 more is still in your cart." */
export function buildCartReminderBody(restaurantName: string, itemNames: string[]) {
  const first = itemNames[0]?.trim();
  const what = first
    ? itemNames.length > 1
      ? `${first} + ${itemNames.length - 1} more`
      : first
    : "your items";
  return restaurantName
    ? `${what} from ${restaurantName} is still in your cart. Order now before it's gone!`
    : `${what} is still in your cart. Order now before it's gone!`;
}
