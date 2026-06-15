import {
  VoucherModel,
  VoucherRedemptionModel,
} from "../src/modules/customer/customer.model";
import { LedgerEntryModel } from "../src/modules/owner/finance.model";
import { OrderModel } from "../src/modules/owner/operational.model";

describe("order flow persistence guards", () => {
  it("keeps customer order placement idempotent by client order id", () => {
    expect(OrderModel.schema.path("clientOrderId")).toBeTruthy();

    const indexes = OrderModel.schema.indexes();
    const idempotencyIndex = indexes.find(([fields]) => {
      return fields.customerId === 1 && fields.clientOrderId === 1;
    });

    expect(idempotencyIndex).toBeTruthy();
    expect(idempotencyIndex?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: {
        clientOrderId: { $type: "string", $ne: "" },
      },
    });
  });

  it("keeps voucher reservations releasable and prevents duplicate redemption rows per order", () => {
    expect(VoucherRedemptionModel.schema.path("releasedAt")).toBeTruthy();
    expect(VoucherRedemptionModel.schema.path("releaseReason")).toBeTruthy();

    const indexes = VoucherRedemptionModel.schema.indexes();
    const activeUsageIndex = indexes.find(([fields]) => {
      return fields.voucherId === 1 && fields.releasedAt === 1;
    });
    const perOrderVoucherIndex = indexes.find(([fields]) => {
      return fields.orderId === 1 && fields.voucherId === 1;
    });

    expect(activeUsageIndex).toBeTruthy();
    expect(perOrderVoucherIndex).toBeTruthy();
    expect(perOrderVoucherIndex?.[1]).toMatchObject({ unique: true });
  });

  it("keeps voucher funding split and platform discount accounting fields", () => {
    expect(VoucherModel.schema.path("fundedBy")).toBeTruthy();
    expect(VoucherModel.schema.path("ownerSharePercent")).toBeTruthy();
    expect(VoucherModel.schema.path("platformSharePercent")).toBeTruthy();
    expect(LedgerEntryModel.schema.path("discountCost")).toBeTruthy();
    expect(LedgerEntryModel.schema.path("platformDiscountCost")).toBeTruthy();
  });
});
