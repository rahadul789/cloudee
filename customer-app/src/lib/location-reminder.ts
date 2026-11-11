// "Are you somewhere else now?" — when the phone is far from the selected delivery
// address, remind the customer (in Bangla) on app open. Pure rules, unit-tested.

/** Further than this from the selected address → worth asking. */
export const LOCATION_REMINDER_DISTANCE_KM = 1.5;
/** Never ask more than once in this window. */
export const LOCATION_REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** "Keep this address" silences it for that address for a day. */
export const LOCATION_REMINDER_SNOOZE_MS = 24 * 60 * 60 * 1000;

export type LocationReminderState = {
  lastPromptAt: number;
  snoozedLocationId: string;
  snoozedAt: number;
};

export function shouldShowLocationReminder(params: {
  distanceKm: number;
  now: number;
  selectedLocationId: string;
  state: LocationReminderState;
}) {
  const { distanceKm, now, selectedLocationId, state } = params;
  if (!Number.isFinite(distanceKm) || distanceKm < LOCATION_REMINDER_DISTANCE_KM) return false;
  if (now - state.lastPromptAt < LOCATION_REMINDER_COOLDOWN_MS) return false;
  if (
    state.snoozedLocationId &&
    state.snoozedLocationId === selectedLocationId &&
    now - state.snoozedAt < LOCATION_REMINDER_SNOOZE_MS
  ) {
    return false;
  }
  return true;
}

const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBanglaDigits(value: string | number) {
  return String(value).replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)]);
}

/** "প্রায় ২.৩ কিমি" / "প্রায় ১২ কিমি" */
export function formatBanglaDistance(distanceKm: number) {
  const rounded = distanceKm < 10 ? Math.round(distanceKm * 10) / 10 : Math.round(distanceKm);
  return `প্রায় ${toBanglaDigits(rounded)} কিমি`;
}
