jest.mock("../src/modules/service-area/service-area.service", () => ({
  buildOrderServiceAreaScopeFilter: (scope: { zoneId?: string }) => scope.zoneId ? { "serviceAreaSnapshot.zoneId": scope.zoneId } : {},
}));

import { fillPlatformDailySeries } from "../src/modules/admin/finance.service";

describe("finance accounting", () => {
  afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

  it("applies wallet income, expense and paid salary to the daily profit and cash charts", () => {
    const date = "2026-11-08";
    const points = fillPlatformDailySeries({
      start: new Date(`${date}T00:00:00Z`), end: new Date(`${date}T23:59:59Z`),
      ledgerRows: [{ _id: date, commission: 100, platformDiscountCost: 10 }],
      orderRows: [{ _id: date, deliveryFees: 60, codCollected: 560 }],
      refundRows: [], payoutRows: [],
      // Includes a cash-only deposit of 200; it must not increase revenue.
      walletRows: [{ _id: date, manualIncome: 50, manualExpense: 20, creditAmount: 250, debitAmount: 20 }],
      payrollPayments: [{ date, amount: 30 }, { date, amount: 10 }],
    });
    expect(points.find((point) => point.date === date)).toMatchObject({ revenue: 210, operatingExpense: 70, profit: 140, cashIn: 810, cashOut: 60 });
  });

});
