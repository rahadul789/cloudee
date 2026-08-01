import {
  canOptIntoUrgentDelivery,
  isUrgentOrder,
  urgentDeliveryLabel,
  type CustomerUrgentDeliveryInfo,
} from "@/src/lib/urgent-delivery";

const info = (
  overrides: Partial<CustomerUrgentDeliveryInfo> = {},
): CustomerUrgentDeliveryInfo => ({
  enabled: true,
  label: "Urgent delivery",
  note: "",
  amount: 30,
  charged: false,
  ...overrides,
});

describe("urgentDeliveryLabel", () => {
  it("falls back to a default when the label is missing or blank", () => {
    expect(urgentDeliveryLabel(null)).toBe("Urgent delivery");
    expect(urgentDeliveryLabel(info({ label: "   " }))).toBe("Urgent delivery");
  });

  it("uses the admin-set label when present", () => {
    expect(urgentDeliveryLabel(info({ label: "Priority delivery" }))).toBe(
      "Priority delivery",
    );
  });
});

describe("canOptIntoUrgentDelivery", () => {
  it("is true only for an enabled add-on with a positive amount", () => {
    expect(canOptIntoUrgentDelivery(info({ enabled: true, amount: 30 }))).toBe(
      true,
    );
  });

  it("is false when disabled, zero amount, or missing", () => {
    expect(canOptIntoUrgentDelivery(null)).toBe(false);
    expect(canOptIntoUrgentDelivery(info({ enabled: false }))).toBe(false);
    expect(canOptIntoUrgentDelivery(info({ amount: 0 }))).toBe(false);
  });
});

describe("isUrgentOrder", () => {
  it("is true for the top-level flag, charged info, or a positive fee", () => {
    expect(isUrgentOrder({ isUrgent: true })).toBe(true);
    expect(
      isUrgentOrder({ pricing: { urgentDeliveryInfo: { charged: true } } }),
    ).toBe(true);
    expect(isUrgentOrder({ pricing: { urgentDeliveryFee: 25 } })).toBe(true);
  });

  it("is false for missing, non-urgent, or zero-fee orders", () => {
    expect(isUrgentOrder(null)).toBe(false);
    expect(isUrgentOrder({})).toBe(false);
    expect(
      isUrgentOrder({
        isUrgent: false,
        pricing: { urgentDeliveryFee: 0, urgentDeliveryInfo: { charged: false } },
      }),
    ).toBe(false);
  });
});
