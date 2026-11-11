import { formatDeliverToLine, isPlusCode } from "./location-address";
import { formatBanglaDistance, shouldShowLocationReminder, toBanglaDigits } from "./location-reminder";

describe("deliver-to line", () => {
  it("drops Plus codes and shows the district", () => {
    expect(isPlusCode("8RQ2+X5")).toBe(true);
    expect(isPlusCode("Mirpur 10")).toBe(false);
    expect(formatDeliverToLine({ label: "8RQ2+X5", address: "8RQ2+X5, Mirpur 10, Dhaka" })).toBe("Mirpur 10, Dhaka");
    expect(formatDeliverToLine({ label: "Road 5", address: "Road 5, Mirpur, Dhaka" })).toBe("Road 5, Dhaka");
  });

  it("keeps Home/Work presets and handles short addresses", () => {
    expect(formatDeliverToLine({ label: "Home", address: "Mirpur 10, Dhaka" })).toBe("Home · Mirpur 10, Dhaka");
    expect(formatDeliverToLine({ label: "Selected location", address: "Dhaka" })).toBe("Dhaka");
    expect(formatDeliverToLine(null)).toBe("Choose your location");
    // only a Plus code known → show it rather than nothing
    expect(formatDeliverToLine({ label: "8RQ2+X5", address: "8RQ2+X5" })).toBe("8RQ2+X5");
  });
});

describe("location reminder", () => {
  const now = Date.UTC(2026, 10, 9, 8);
  const fresh = { lastPromptAt: 0, snoozedLocationId: "", snoozedAt: 0 };

  it("asks only when far away", () => {
    expect(shouldShowLocationReminder({ distanceKm: 0.5, now, selectedLocationId: "a", state: fresh })).toBe(false);
    expect(shouldShowLocationReminder({ distanceKm: 3, now, selectedLocationId: "a", state: fresh })).toBe(true);
  });

  it("respects the cooldown and the per-address snooze", () => {
    expect(
      shouldShowLocationReminder({ distanceKm: 3, now, selectedLocationId: "a", state: { ...fresh, lastPromptAt: now - 60_000 } }),
    ).toBe(false);
    expect(
      shouldShowLocationReminder({
        distanceKm: 3,
        now,
        selectedLocationId: "a",
        state: { lastPromptAt: now - 7 * 3_600_000, snoozedLocationId: "a", snoozedAt: now - 7 * 3_600_000 },
      }),
    ).toBe(false);
    // a different address isn't snoozed
    expect(
      shouldShowLocationReminder({
        distanceKm: 3,
        now,
        selectedLocationId: "b",
        state: { lastPromptAt: now - 7 * 3_600_000, snoozedLocationId: "a", snoozedAt: now - 7 * 3_600_000 },
      }),
    ).toBe(true);
  });

  it("formats Bangla numbers", () => {
    expect(toBanglaDigits("2.3")).toBe("২.৩");
    expect(formatBanglaDistance(2.34)).toBe("প্রায় ২.৩ কিমি");
    expect(formatBanglaDistance(12.6)).toBe("প্রায় ১৩ কিমি");
  });
});
