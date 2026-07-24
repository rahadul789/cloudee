import {
  computeRestaurantAvailability,
  evaluateSchedule,
} from "../src/modules/customer/restaurant-availability";
import type { ServiceHoursConfig } from "../src/modules/service-area/service-hours";

// A Date whose Asia/Dhaka (UTC+6) wall clock reads hour:minute on 2026-07-21.
function atDhaka(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 6, 21, hour - 6, minute));
}

const window11to23: ServiceHoursConfig = {
  enabled: true,
  openMinute: 11 * 60, // 11:00
  closeMinute: 23 * 60, // 23:00
  timezone: "Asia/Dhaka",
};

// weeklySchedule that opens 2:00 PM–10:00 PM every day, so the weekday of the test
// date never matters.
const opensAt2pm = {
  timezone: "Asia/Dhaka",
  weeklySchedule: [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ].map((day) => ({
    day,
    isOpen: true,
    is24Hours: false,
    timeSlots: [{ startTime: "14:00", endTime: "22:00" }],
  })),
  exceptions: [],
};

describe("computeRestaurantAvailability", () => {
  it("restricted wins over everything", () => {
    const a = computeRestaurantAvailability({
      serviceHours: window11to23,
      isOnline: true,
      restricted: true,
      openingHours: null,
      now: atDhaka(15, 0),
    });
    expect(a).toMatchObject({ isOpen: false, closedReason: "restricted", opensAtLabel: null });
  });

  it("before the service window → service_window + opens-at label", () => {
    const a = computeRestaurantAvailability({
      serviceHours: window11to23,
      isOnline: true,
      restricted: false,
      openingHours: null,
      now: atDhaka(9, 30),
    });
    expect(a.isOpen).toBe(false);
    expect(a.closedReason).toBe("service_window");
    expect(a.opensAtLabel).toBe("11:00 AM");
    expect(typeof a.opensAtEpochMs).toBe("number");
    // ~90 minutes away from 9:30.
    const mins = (a.opensAtEpochMs! - atDhaka(9, 30).getTime()) / 60000;
    expect(Math.round(mins)).toBe(90);
  });

  it("inside window + owner online → open", () => {
    const a = computeRestaurantAvailability({
      serviceHours: window11to23,
      isOnline: true,
      restricted: false,
      openingHours: opensAt2pm,
      now: atDhaka(15, 0),
    });
    expect(a).toMatchObject({ isOpen: true, closedReason: null, opensAtLabel: null });
  });

  it("owner online overrides its own schedule (open before 2pm if online)", () => {
    // 12:00: window open, owner online, schedule says 2pm — owner wins → open.
    const a = computeRestaurantAvailability({
      serviceHours: window11to23,
      isOnline: true,
      restricted: false,
      openingHours: opensAt2pm,
      now: atDhaka(12, 0),
    });
    expect(a.isOpen).toBe(true);
  });

  it("window open, owner offline, before scheduled open → schedule predictor 'Opens at 2:00 PM'", () => {
    const a = computeRestaurantAvailability({
      serviceHours: window11to23,
      isOnline: false,
      restricted: false,
      openingHours: opensAt2pm,
      now: atDhaka(12, 0),
    });
    expect(a.isOpen).toBe(false);
    expect(a.closedReason).toBe("schedule");
    expect(a.opensAtLabel).toBe("2:00 PM");
    const mins = (a.opensAtEpochMs! - atDhaka(12, 0).getTime()) / 60000;
    expect(Math.round(mins)).toBe(120);
  });

  it("window open, owner offline, within scheduled hours (busy) → owner_busy, no time", () => {
    const a = computeRestaurantAvailability({
      serviceHours: window11to23,
      isOnline: false,
      restricted: false,
      openingHours: opensAt2pm,
      now: atDhaka(15, 0), // inside 14:00–22:00 but owner offline
    });
    expect(a).toMatchObject({
      isOpen: false,
      closedReason: "owner_busy",
      opensAtLabel: null,
      opensAtEpochMs: null,
    });
  });

  it("window open, owner offline, no schedule set → owner_busy (safe fallback)", () => {
    const a = computeRestaurantAvailability({
      serviceHours: window11to23,
      isOnline: false,
      restricted: false,
      openingHours: null,
      now: atDhaka(15, 0),
    });
    expect(a).toMatchObject({ isOpen: false, closedReason: "owner_busy", opensAtLabel: null });
  });

  it("service hours disabled → only owner toggle matters", () => {
    const disabled = { ...window11to23, enabled: false };
    expect(
      computeRestaurantAvailability({
        serviceHours: disabled,
        isOnline: true,
        restricted: false,
        openingHours: null,
        now: atDhaka(3, 0),
      }).isOpen,
    ).toBe(true);
    expect(
      computeRestaurantAvailability({
        serviceHours: disabled,
        isOnline: false,
        restricted: false,
        openingHours: null,
        now: atDhaka(3, 0),
      }).closedReason,
    ).toBe("owner_busy");
  });
});

describe("evaluateSchedule", () => {
  it("reports open-now inside a slot", () => {
    expect(evaluateSchedule(opensAt2pm, atDhaka(15, 0)).openNow).toBe(true);
    expect(evaluateSchedule(opensAt2pm, atDhaka(12, 0)).openNow).toBe(false);
  });

  it("finds the next open later today", () => {
    const s = evaluateSchedule(opensAt2pm, atDhaka(12, 0));
    expect(s.nextOpen?.openMinute).toBe(14 * 60);
    expect(s.nextOpen?.dayOffset).toBe(0);
  });

  it("rolls to the next day after the last slot", () => {
    // 23:00 — past today's 14:00–22:00 window → next open is tomorrow 14:00.
    const s = evaluateSchedule(opensAt2pm, atDhaka(23, 0));
    expect(s.openNow).toBe(false);
    expect(s.nextOpen?.dayOffset).toBe(1);
    expect(s.nextOpen?.openMinute).toBe(14 * 60);
  });

  it("no schedule → hasSchedule false", () => {
    expect(evaluateSchedule(null, atDhaka(12, 0)).hasSchedule).toBe(false);
    expect(evaluateSchedule({ weeklySchedule: [], exceptions: [] }, atDhaka(12, 0)).hasSchedule).toBe(false);
  });
});
