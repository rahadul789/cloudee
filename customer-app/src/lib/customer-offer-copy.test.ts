import { getOfferAmountLabel, getOfferDiscountText } from "./customer-offer-copy";

describe("offer amount label", () => {
  it("uses the voucher's real discount over its name", () => {
    expect(getOfferAmountLabel({ voucherLabel: "Eid offer", voucherDiscountType: "flat", voucherDiscountValue: 50 })).toBe("৳50 off");
    expect(getOfferDiscountText({ voucherDiscountType: "percentage", voucherDiscountValue: 10, voucherMaxDiscount: 60 })).toBe(
      "10% off · up to ৳60",
    );
    expect(getOfferDiscountText({ voucherDiscountType: "percentage", voucherDiscountValue: 15 })).toBe("15% off");
    expect(getOfferAmountLabel({ voucherLabel: "x", voucherDiscountType: "free_delivery" })).toBe("Free delivery");
  });
  it("falls back to the label when the discount is unknown (old data)", () => {
    expect(getOfferAmountLabel({ voucherLabel: "৳20 reward" })).toBe("৳20 reward");
    expect(getOfferAmountLabel({})).toBe("Special discount");
  });
});
