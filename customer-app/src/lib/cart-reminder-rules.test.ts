import {
  CART_REMINDER_DELAY_MS,
  buildCartReminderBody,
  planCartReminder,
} from "./cart-reminder-rules";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Fixed "local hour" = hour of a UTC clock so tests don't depend on the machine timezone.
const hourOf = (ms: number) => new Date(ms).getUTCHours();
const noon = Date.UTC(2026, 10, 9, 12, 0, 0);

const base = {
  now: noon,
  hasItems: true,
  lastChangeAt: noon,
  sentAts: [] as number[],
  hourOf,
};

describe("cart reminder rules", () => {
  it("fires 60 minutes after the last cart change", () => {
    expect(planCartReminder(base)).toBe(noon + CART_REMINDER_DELAY_MS);
  });

  it("never re-creates a reminder for an old cart when the app is reopened", () => {
    expect(planCartReminder({ ...base, lastChangeAt: noon - 3 * HOUR })).toBeNull();
    expect(planCartReminder({ ...base, lastChangeAt: noon - 30 * 60 * 1000 })).toBe(noon + 30 * 60 * 1000);
  });

  it("never fires for an empty cart or with promotions turned off", () => {
    expect(planCartReminder({ ...base, hasItems: false })).toBeNull();
    expect(planCartReminder({ ...base, promotionsEnabled: false })).toBeNull();
  });

  it("max one per 24h and two per week", () => {
    expect(planCartReminder({ ...base, sentAts: [noon - 10 * HOUR] })).toBeNull();
    expect(planCartReminder({ ...base, sentAts: [noon - 2 * DAY] })).toBe(noon + CART_REMINDER_DELAY_MS);
    expect(planCartReminder({ ...base, sentAts: [noon - 2 * DAY, noon - 4 * DAY] })).toBeNull();
    expect(planCartReminder({ ...base, sentAts: [noon - 2 * DAY, noon - 9 * DAY] })).not.toBeNull();
  });

  it("respects quiet hours (23:00–10:00)", () => {
    const lateEvening = Date.UTC(2026, 10, 9, 22, 30, 0); // fire 23:30 → quiet
    expect(planCartReminder({ ...base, now: lateEvening, lastChangeAt: lateEvening })).toBeNull();
    const earlyMorning = Date.UTC(2026, 10, 9, 7, 0, 0); // fire 08:00 → quiet
    expect(planCartReminder({ ...base, now: earlyMorning, lastChangeAt: earlyMorning })).toBeNull();
  });

  it("doesn't fire after (or right before) Foodbela closes", () => {
    expect(planCartReminder({ ...base, closesAtEpochMs: noon + 50 * 60 * 1000 })).toBeNull();
    expect(planCartReminder({ ...base, closesAtEpochMs: noon + 3 * HOUR })).toBe(noon + CART_REMINDER_DELAY_MS);
  });

  it("builds a friendly body", () => {
    expect(buildCartReminderBody("Kacchi Bhai", ["Chicken Kacchi", "Borhani", "Firni"])).toBe(
      "Chicken Kacchi + 2 more from Kacchi Bhai is still in your cart. Order now before it's gone!",
    );
  });
});
