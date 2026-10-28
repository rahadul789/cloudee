jest.mock("../src/config/socket", () => ({ emitSocketEvent: jest.fn() }));
jest.mock("../src/modules/rider/push.service", () => ({ sendPushToRider: jest.fn().mockResolvedValue({ sent: 1 }) }));
jest.mock("../src/modules/admin/admin-alert.service", () => ({ createAdminOperationalAlert: jest.fn(), resolveAdminOperationalAlertByDedupeKey: jest.fn() }));

import { RestaurantModel } from "../src/modules/auth/auth.model";
import { OrderModel } from "../src/modules/owner/operational.model";
import { SupportCaseModel } from "../src/modules/owner/experience.model";
import { processAdminOperationalAlerts } from "../src/modules/admin/orders-monitor.service";
import { createAdminOperationalAlert } from "../src/modules/admin/admin-alert.service";
import { sendPushToRider } from "../src/modules/rider/push.service";
import * as contentService from "../src/modules/public/content.service";
import { platformContent } from "../src/modules/public/content";
import * as areas from "../src/modules/service-area/service-area.service";

function query(data: any): any {
  const chain: any = {};
  for (const method of ["sort", "limit"]) chain[method] = () => chain;
  chain.lean = async () => data;
  return chain;
}

describe("scheduled rider delay notifications", () => {
  let orders: any[];
  beforeEach(() => {
    jest.clearAllMocks();
    orders = [];
    const content = JSON.parse(JSON.stringify(platformContent));
    Object.assign(content.operations.dispatch, {
      assignmentTimeoutMinutes: 8, pickupLateGraceMinutes: 10,
      deliveryWatchAfterPickupMinutes: 20, deliveryLateAfterPickupMinutes: 25,
      deliveryCriticalAfterPickupMinutes: 30,
    });
    jest.spyOn(contentService, "getPlatformContent").mockResolvedValue(content);
    jest.spyOn(areas, "getServiceAreaDispatchOverrides").mockResolvedValue(null);
    jest.spyOn(OrderModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as any);
    jest.spyOn(OrderModel, "find").mockImplementation((filter: any) => query(filter.paymentStatus ? [] : orders));
    jest.spyOn(RestaurantModel, "find").mockReturnValue(query([]));
    jest.spyOn(SupportCaseModel, "find").mockReturnValue(query([]));
    jest.mocked(createAdminOperationalAlert).mockResolvedValue({ created: true } as any);
  });
  afterEach(() => jest.restoreAllMocks());

  function setOrder(status: string, minutes: number, remainingDurationMinutes = 0) {
    const at = new Date(Date.now() - minutes * 60_000);
    orders.push({ _id: "order-1", orderNumber: "FB-1", riderId: "rider-1", status,
      createdAt: at, timestamps: { [status]: at }, dispatchMeta: { assignedAt: at },
      riderTracking: { lastUpdatedAt: new Date(), remainingDurationMinutes },
    });
  }

  it("sends overdue acknowledgement and pickup reminders with the hurry voice", async () => {
    setOrder("ReadyForPickup", 11);
    await processAdminOperationalAlerts();
    for (const type of ["rider_response_late", "rider_pickup_late"]) {
      expect(sendPushToRider).toHaveBeenCalledWith(expect.objectContaining({ riderId: "rider-1", payload: expect.objectContaining({ channelId: "delivery-late", data: expect.objectContaining({ type, orderId: "order-1" }) }) }));
    }
  });

  it.each([[26, "delivery_late_after_pickup"], [31, "delivery_critical_after_pickup"]])("sends the %s minute delivery reminder", async (minutes, type) => {
    setOrder("PickedUp", minutes);
    await processAdminOperationalAlerts();
    expect(sendPushToRider).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ channelId: "delivery-late", data: expect.objectContaining({ type }) }) }));
  });

  it("sends an ETA-exceeded reminder with the hurry voice", async () => {
    setOrder("PickedUp", 13, 2);
    await processAdminOperationalAlerts();
    expect(sendPushToRider).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ channelId: "delivery-late", data: expect.objectContaining({ type: "delivery_eta_exceeded" }) }) }));
  });

  it.each(["ReadyForPickup", "PickedUp"])("does not send early reminders for %s", async (status) => {
    setOrder(status, 2);
    await processAdminOperationalAlerts();
    expect(sendPushToRider).not.toHaveBeenCalled();
  });

  it("still alerts the rider when admin inbox alerts are disabled", async () => {
    setOrder("PickedUp", 31);
    jest.mocked(createAdminOperationalAlert).mockResolvedValue({ created: false, skipped: true } as any);
    await processAdminOperationalAlerts();
    expect(sendPushToRider).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ data: expect.objectContaining({ type: "delivery_critical_after_pickup" }) }) }));
  });

  it("does not resend an already-created delay alert", async () => {
    setOrder("PickedUp", 31);
    jest.mocked(OrderModel.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    await processAdminOperationalAlerts();
    expect(sendPushToRider).not.toHaveBeenCalled();
  });
});
