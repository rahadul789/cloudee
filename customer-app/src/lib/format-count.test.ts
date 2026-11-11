import { formatCompactCount } from "./format-count";

describe("formatCompactCount", () => {
  it("keeps small counts as-is", () => {
    expect(formatCompactCount(7)).toBe("7");
    expect(formatCompactCount(999)).toBe("999");
  });

  it("shortens thousands and millions", () => {
    expect(formatCompactCount(1000)).toBe("1k");
    expect(formatCompactCount(1250)).toBe("1.2k");
    expect(formatCompactCount(9999)).toBe("9.9k");
    expect(formatCompactCount(12500)).toBe("12k");
    expect(formatCompactCount(1_250_000)).toBe("1.2M");
  });

  it("handles empty values", () => {
    expect(formatCompactCount(undefined)).toBe("0");
    expect(formatCompactCount(Number.NaN)).toBe("0");
  });
});
