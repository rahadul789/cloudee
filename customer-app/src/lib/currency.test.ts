import { formatCurrency } from "@/src/lib/currency";

describe("formatCurrency", () => {
  it("prefixes with Tk and drops decimals", () => {
    expect(formatCurrency(299)).toBe("Tk 299");
    expect(formatCurrency(0)).toBe("Tk 0");
  });

  it("rounds to the nearest whole taka", () => {
    expect(formatCurrency(299.4)).toBe("Tk 299");
    expect(formatCurrency(299.6)).toBe("Tk 300");
  });

  it("keeps negative amounts (e.g. discounts) signed", () => {
    expect(formatCurrency(-50)).toBe("Tk -50");
  });
});
