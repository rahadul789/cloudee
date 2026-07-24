import {
  DEFAULT_PLATFORM_SERVICE_HOURS,
  evaluateServiceWindow,
  evaluateServiceWindowForOverride,
  formatMinuteOfDay,
  formatMinuteOfDayLabel,
  getDhakaMinuteOfDay,
  isMinuteWithinWindow,
  resolveServiceHoursConfig,
  type ServiceHoursConfig,
} from "../src/modules/service-area/service-hours";

// A Date whose Asia/Dhaka (UTC+6, no DST) wall clock reads exactly hour:minute.
// Subtracting 6h from the UTC hour makes Intl format back to the wanted local time;
// Date.UTC handles day rollover when hour < 6.
function atDhaka(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 6, 21, hour - 6, minute));
}

const base: ServiceHoursConfig = {
  enabled: true,
  openMinute: 720, // 12:00
  closeMinute: 1380, // 23:00
  timezone: "Asia/Dhaka",
};

describe("getDhakaMinuteOfDay", () => {
  it("converts UTC to the Asia/Dhaka minute-of-day (UTC+6)", () => {
    // 00:00 UTC → 06:00 Dhaka → 360
    expect(getDhakaMinuteOfDay(new Date("2026-07-21T00:00:00Z"))).toBe(360);
    // 17:00 UTC → 23:00 Dhaka → 1380
    expect(getDhakaMinuteOfDay(new Date("2026-07-21T17:00:00Z"))).toBe(1380);
    // 18:30 UTC → 00:30 next-day Dhaka → 30
    expect(getDhakaMinuteOfDay(new Date("2026-07-21T18:30:00Z"))).toBe(30);
  });

  it("matches the atDhaka test helper", () => {
    expect(getDhakaMinuteOfDay(atDhaka(12, 0))).toBe(720);
    expect(getDhakaMinuteOfDay(atDhaka(2, 15))).toBe(135);
    expect(getDhakaMinuteOfDay(atDhaka(23, 59))).toBe(1439);
  });
});

describe("isMinuteWithinWindow", () => {
  it("same-day window is closed at/after close and before open", () => {
    // 12:00–23:00
    expect(isMinuteWithinWindow(719, 720, 1380)).toBe(false); // 11:59
    expect(isMinuteWithinWindow(720, 720, 1380)).toBe(true); // 12:00 (inclusive)
    expect(isMinuteWithinWindow(1000, 720, 1380)).toBe(true);
    expect(isMinuteWithinWindow(1379, 720, 1380)).toBe(true); // 22:59
    expect(isMinuteWithinWindow(1380, 720, 1380)).toBe(false); // 23:00 (exclusive)
  });

  it("treats closeMinute 1440 as end-of-day (open through 23:59)", () => {
    expect(isMinuteWithinWindow(1439, 720, 1440)).toBe(true); // 23:59
    expect(isMinuteWithinWindow(720, 720, 1440)).toBe(true);
    expect(isMinuteWithinWindow(719, 720, 1440)).toBe(false);
  });

  it("wraps past midnight when close <= open (23:00–02:00)", () => {
    expect(isMinuteWithinWindow(1380, 1380, 120)).toBe(true); // 23:00
    expect(isMinuteWithinWindow(1439, 1380, 120)).toBe(true); // 23:59
    expect(isMinuteWithinWindow(0, 1380, 120)).toBe(true); // 00:00
    expect(isMinuteWithinWindow(119, 1380, 120)).toBe(true); // 01:59
    expect(isMinuteWithinWindow(120, 1380, 120)).toBe(false); // 02:00 (exclusive)
    expect(isMinuteWithinWindow(720, 1380, 120)).toBe(false); // 12:00 (outside)
  });

  it("treats a zero-length window (open === close) as always open", () => {
    // A 0-length 'closed' would silently take the whole platform offline — never the intent.
    expect(isMinuteWithinWindow(0, 600, 600)).toBe(true);
    expect(isMinuteWithinWindow(1439, 600, 600)).toBe(true);
  });
});

describe("resolveServiceHoursConfig", () => {
  it("returns the base when there is no override", () => {
    expect(resolveServiceHoursConfig(null, base)).toEqual(base);
    expect(resolveServiceHoursConfig(undefined, base)).toEqual(base);
    expect(resolveServiceHoursConfig({}, base)).toEqual(base);
  });

  it("merges a partial override, inheriting the rest", () => {
    expect(resolveServiceHoursConfig({ openMinute: 600 }, base)).toEqual({
      ...base,
      openMinute: 600,
    });
  });

  it("honors an explicit enabled override (including false)", () => {
    expect(resolveServiceHoursConfig({ enabled: false }, base).enabled).toBe(false);
    expect(resolveServiceHoursConfig({ enabled: true }, { ...base, enabled: false }).enabled).toBe(
      true,
    );
  });

  it("inherits base.enabled when the override omits it", () => {
    expect(resolveServiceHoursConfig({ enabled: null }, base).enabled).toBe(true);
    expect(resolveServiceHoursConfig({ openMinute: 600 }, base).enabled).toBe(true);
  });

  it("ignores invalid minute overrides and keeps the base", () => {
    expect(resolveServiceHoursConfig({ openMinute: -5 }, base).openMinute).toBe(720);
    expect(resolveServiceHoursConfig({ openMinute: 2000 }, base).openMinute).toBe(720);
    expect(resolveServiceHoursConfig({ closeMinute: Number.NaN }, base).closeMinute).toBe(1380);
    expect(
      resolveServiceHoursConfig({ closeMinute: "1200" as unknown as number }, base).closeMinute,
    ).toBe(1380);
  });
});

describe("evaluateServiceWindow", () => {
  it("is always open when disabled, regardless of the clock", () => {
    const disabled = { ...base, enabled: false };
    expect(evaluateServiceWindow(disabled, atDhaka(3, 0)).isOpen).toBe(true);
    expect(evaluateServiceWindow(disabled, atDhaka(15, 0)).isOpen).toBe(true);
  });

  it("is open inside the window and closed outside", () => {
    expect(evaluateServiceWindow(base, atDhaka(11, 59)).isOpen).toBe(false);
    expect(evaluateServiceWindow(base, atDhaka(12, 0)).isOpen).toBe(true);
    expect(evaluateServiceWindow(base, atDhaka(22, 59)).isOpen).toBe(true);
    expect(evaluateServiceWindow(base, atDhaka(23, 0)).isOpen).toBe(false);
  });

  it("reports the resolved window and current minute", () => {
    const state = evaluateServiceWindow(base, atDhaka(20, 0));
    expect(state).toMatchObject({
      enabled: true,
      isOpen: true,
      openMinute: 720,
      closeMinute: 1380,
      timezone: "Asia/Dhaka",
      nowMinute: 1200,
    });
  });
});

describe("evaluateServiceWindowForOverride", () => {
  it("evaluates a zone override layered on the platform default", () => {
    // Zone opens earlier (10:00) than the 12:00 platform default.
    const override = { openMinute: 600 };
    expect(evaluateServiceWindowForOverride(override, base, atDhaka(10, 30)).isOpen).toBe(true);
    // At 11:30 the platform default alone would be closed, but the zone is open.
    expect(evaluateServiceWindowForOverride(override, base, atDhaka(11, 30)).isOpen).toBe(true);
  });

  it("a disabled zone override never closes anything", () => {
    expect(
      evaluateServiceWindowForOverride({ enabled: false }, base, atDhaka(3, 0)).isOpen,
    ).toBe(true);
  });

  it("with no override, behaves exactly like the platform default", () => {
    expect(evaluateServiceWindowForOverride(null, base, atDhaka(11, 59)).isOpen).toBe(false);
    expect(evaluateServiceWindowForOverride(null, base, atDhaka(12, 0)).isOpen).toBe(true);
  });
});

describe("formatMinuteOfDay", () => {
  it("renders HH:MM", () => {
    expect(formatMinuteOfDay(0)).toBe("00:00");
    expect(formatMinuteOfDay(90)).toBe("01:30");
    expect(formatMinuteOfDay(720)).toBe("12:00");
    expect(formatMinuteOfDay(1380)).toBe("23:00");
    expect(formatMinuteOfDay(1439)).toBe("23:59");
    expect(formatMinuteOfDay(1440)).toBe("24:00");
  });
});

describe("formatMinuteOfDayLabel (owner-facing AM/PM)", () => {
  it("renders 12-hour AM/PM", () => {
    expect(formatMinuteOfDayLabel(0)).toBe("12:00 AM"); // midnight
    expect(formatMinuteOfDayLabel(90)).toBe("1:30 AM");
    expect(formatMinuteOfDayLabel(600)).toBe("10:00 AM");
    expect(formatMinuteOfDayLabel(720)).toBe("12:00 PM"); // noon
    expect(formatMinuteOfDayLabel(780)).toBe("1:00 PM"); // 13:00 → 1 PM
    expect(formatMinuteOfDayLabel(1380)).toBe("11:00 PM");
    expect(formatMinuteOfDayLabel(1439)).toBe("11:59 PM");
    expect(formatMinuteOfDayLabel(1440)).toBe("12:00 AM"); // end-of-day = midnight
  });
});

describe("DEFAULT_PLATFORM_SERVICE_HOURS", () => {
  it("is 12:00–23:00 Asia/Dhaka and enabled", () => {
    expect(DEFAULT_PLATFORM_SERVICE_HOURS).toEqual({
      enabled: true,
      openMinute: 720,
      closeMinute: 1380,
      timezone: "Asia/Dhaka",
    });
  });
});
