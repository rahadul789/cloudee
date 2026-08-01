import {
  buildDeliveryWhyText,
  hasDeliveryDistanceSurcharge,
  type CustomerDeliveryBreakdown,
} from "@/src/lib/delivery-breakdown";

const breakdown = (
  overrides: Partial<CustomerDeliveryBreakdown> = {},
): CustomerDeliveryBreakdown => ({
  distanceKm: 3,
  baseFee: 20,
  baseCoversKm: 2,
  distanceSurchargeEnabled: false,
  extraDistanceKm: 0,
  extraDistanceFee: 0,
  surchargeStepMeters: 500,
  surchargeAmountTaka: 5,
  totalFee: 20,
  ...overrides,
});

describe("hasDeliveryDistanceSurcharge", () => {
  it("is false without a breakdown or when no extra was charged", () => {
    expect(hasDeliveryDistanceSurcharge(null)).toBe(false);
    expect(hasDeliveryDistanceSurcharge(undefined)).toBe(false);
    expect(hasDeliveryDistanceSurcharge(breakdown())).toBe(false);
  });

  it("is true only when an extra distance fee sits on top of the base", () => {
    expect(hasDeliveryDistanceSurcharge(breakdown({ extraDistanceFee: 10 }))).toBe(
      true,
    );
  });
});

describe("buildDeliveryWhyText", () => {
  it("returns null when there is nothing meaningful to say", () => {
    expect(buildDeliveryWhyText(null)).toBeNull();
    // No distance known and no surcharge → no note.
    expect(buildDeliveryWhyText(breakdown({ distanceKm: null }))).toBeNull();
  });

  it("shows no note for a flat fee (self-explanatory, keeps the row clean)", () => {
    expect(buildDeliveryWhyText(breakdown())).toBeNull();
  });

  it("spells out base + extra when a distance surcharge was charged", () => {
    expect(
      buildDeliveryWhyText(
        breakdown({
          extraDistanceFee: 10,
          extraDistanceKm: 1,
          totalFee: 30,
        }),
      ),
    ).toBe("3 km · Base Tk 20 + 1 km extra Tk 10");
  });

  it("falls back to a plain distance-surcharge phrase when extra km is unknown", () => {
    expect(
      buildDeliveryWhyText(
        breakdown({ distanceKm: null, extraDistanceFee: 10, extraDistanceKm: 0 }),
      ),
    ).toBe("Base Tk 20 + distance Tk 10");
  });
});
