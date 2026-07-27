import { formatShortOrderId, formatShortOrderIdLabel } from "@/src/lib/order-id";

describe("formatShortOrderId", () => {
  it("returns the last N chars uppercased", () => {
    expect(formatShortOrderId("64f1a2b3c4d5e6f7")).toBe("C4D5E6F7");
    expect(formatShortOrderId("64f1a2b3c4d5e6f7", 4)).toBe("E6F7");
  });

  it("falls back to ORDER for empty/nullish input", () => {
    expect(formatShortOrderId("")).toBe("ORDER");
    expect(formatShortOrderId(null)).toBe("ORDER");
    expect(formatShortOrderId(undefined)).toBe("ORDER");
  });

  it("strips whitespace before slicing", () => {
    expect(formatShortOrderId("  a b c  ")).toBe("ABC");
  });
});

describe("formatShortOrderIdLabel", () => {
  it("wraps the short id in an ID # label", () => {
    expect(formatShortOrderIdLabel("64f1a2b3c4d5e6f7")).toBe("ID #C4D5E6F7");
    expect(formatShortOrderIdLabel("")).toBe("ID #ORDER");
  });
});
