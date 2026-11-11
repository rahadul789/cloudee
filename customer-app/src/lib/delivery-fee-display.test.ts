import { formatCardDeliveryFee } from "./delivery-fee-display";

describe("formatCardDeliveryFee", () => {
  it("hides unknown fees", () => {
    expect(formatCardDeliveryFee(null)).toBeNull();
    expect(formatCardDeliveryFee(undefined)).toBeNull();
    expect(formatCardDeliveryFee(Number.NaN)).toBeNull();
  });
  it("shows free delivery for 0", () => {
    expect(formatCardDeliveryFee(0)).toEqual({ label: "Free delivery", isFree: true });
  });
  it("shows the exact fee up to the cap", () => {
    expect(formatCardDeliveryFee(15)?.label).toBe("৳15");
    expect(formatCardDeliveryFee(20)?.label).toBe("৳20");
  });
  it("caps anything above 20 as 20+", () => {
    expect(formatCardDeliveryFee(25)?.label).toBe("৳20+");
    expect(formatCardDeliveryFee(60)?.label).toBe("৳20+");
  });
});
