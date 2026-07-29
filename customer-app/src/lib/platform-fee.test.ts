import {
  canOptIntoPlatformFee,
  platformFeeLabel,
  type CustomerPlatformFeeInfo,
} from "@/src/lib/platform-fee";

const info = (
  overrides: Partial<CustomerPlatformFeeInfo> = {},
): CustomerPlatformFeeInfo => ({
  enabled: true,
  mode: "flat",
  label: "Platform fee",
  note: "",
  amount: 5,
  percentage: 0,
  optional: false,
  charged: true,
  ...overrides,
});

describe("platformFeeLabel", () => {
  it("falls back to a default when the label is missing or blank", () => {
    expect(platformFeeLabel(null)).toBe("Platform fee");
    expect(platformFeeLabel(info({ label: "   " }))).toBe("Platform fee");
  });

  it("uses the admin-set label when present", () => {
    expect(platformFeeLabel(info({ label: "App support" }))).toBe("App support");
  });
});

describe("canOptIntoPlatformFee", () => {
  it("is true only for an enabled optional fee with a positive amount", () => {
    expect(
      canOptIntoPlatformFee(info({ mode: "optional", optional: true, amount: 5 })),
    ).toBe(true);
  });

  it("is false for mandatory modes, disabled, or a zero amount", () => {
    expect(canOptIntoPlatformFee(null)).toBe(false);
    // Mandatory flat fee is never an opt-in.
    expect(canOptIntoPlatformFee(info({ optional: false }))).toBe(false);
    // Optional but disabled.
    expect(
      canOptIntoPlatformFee(
        info({ mode: "optional", optional: true, enabled: false }),
      ),
    ).toBe(false);
    // Optional but nothing to charge.
    expect(
      canOptIntoPlatformFee(info({ mode: "optional", optional: true, amount: 0 })),
    ).toBe(false);
  });
});
