import { formatPrepTimeRange } from "./date-time";

describe("formatPrepTimeRange", () => {
  it("adds a 10-minute window", () => {
    expect(formatPrepTimeRange(20)).toBe("20-30 min");
    expect(formatPrepTimeRange(15.4)).toBe("15-25 min");
  });
  it("falls back for missing values", () => {
    expect(formatPrepTimeRange(null)).toBe("Not available");
    expect(formatPrepTimeRange(0, "—")).toBe("—");
  });
});
