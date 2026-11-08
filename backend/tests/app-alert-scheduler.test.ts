import { shouldForwardCriticalAlertToTelegram } from "../src/modules/monitoring/app-alert-scheduler";

describe("app alert scheduler Telegram forwarding", () => {
  it("does not replay delivery/order alerts from the active alert list", () => {
    expect(
      shouldForwardCriticalAlertToTelegram({
        severity: "critical",
        entityType: "order",
        source: "Delivery",
        alertType: "delivery_critical_after_pickup",
      }),
    ).toBe(false);
  });

  it("continues forwarding non-delivery critical operational alerts", () => {
    expect(
      shouldForwardCriticalAlertToTelegram({
        severity: "critical",
        entityType: "system",
        source: "Infrastructure",
        alertType: "database_unavailable",
      }),
    ).toBe(true);
  });
});
