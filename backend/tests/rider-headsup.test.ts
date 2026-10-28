jest.mock("../src/config/socket", () => ({ emitSocketEvent: jest.fn() }));
jest.mock("../src/modules/rider/push.service", () => ({ sendPushToRider: jest.fn().mockResolvedValue({ sent: 1 }) }));
jest.mock("../src/modules/customer/push.service", () => ({ sendPushToCustomer: jest.fn() }));
jest.mock("../src/modules/admin/activity-log.service", () => ({ createAdminActivityLog: jest.fn() }));

import { RiderModel, RestaurantModel, OwnerModel } from "../src/modules/auth/auth.model";
import { OrderModel } from "../src/modules/owner/operational.model";
import { transitionOrder } from "../src/modules/owner/operational.service";
import { notifyRidersOrderHeadsUp, updateAdminOrderStatus } from "../src/modules/admin/orders-monitor.service";
import * as contentService from "../src/modules/public/content.service";
import { platformContent } from "../src/modules/public/content";
import * as areas from "../src/modules/service-area/service-area.service";
import { sendPushToRider } from "../src/modules/rider/push.service";
import { emitSocketEvent } from "../src/config/socket";

function query(data: any): any {
  const chain: any = {};
  for (const method of ["select", "sort", "limit"]) chain[method] = () => chain;
  chain.lean = () => Promise.resolve(data);
  return chain;
}

describe("rider acceptance/preparation heads-up", () => {
  let order: any;
  let content: any;
  beforeEach(() => {
    jest.clearAllMocks();
    order = { _id: "order-1", id: "order-1", orderNumber: "FB-1", status: "Accepted", restaurantId: "restaurant-1", timestamps: {}, createdAt: new Date(), dispatchMeta: {} };
    content = JSON.parse(JSON.stringify(platformContent));
    jest.spyOn(contentService, "getPlatformContent").mockImplementation(async () => content);
    jest.spyOn(areas, "getServiceAreaDispatchOverrides").mockResolvedValue(null);
    jest.spyOn(areas, "isRiderAllowedForServiceArea").mockReturnValue(true);
    jest.spyOn(areas, "assertServiceAreaSnapshotMatchesScope").mockImplementation(() => undefined);
    jest.spyOn(RiderModel, "find").mockReturnValue(query([{ _id: "rider-1", fullName: "Rider", isAvailableForAssignments: true }]));
    jest.spyOn(RestaurantModel, "findById").mockReturnValue(query({ _id: "restaurant-1", name: "Restaurant", preparationTimeMinutes: 20 }));
    jest.spyOn(OwnerModel, "findOne").mockReturnValue(query(null));
    jest.spyOn(OrderModel, "aggregate").mockResolvedValue([]);
    jest.spyOn(OrderModel, "updateOne").mockResolvedValue({ modifiedCount: 1 } as any);
    jest.spyOn(OrderModel, "findById").mockReturnValue(query(order));
    jest.spyOn(OrderModel, "findOneAndUpdate").mockImplementation((_filter: any, update: any) => {
      order = { ...order, ...update.$set };
      return Promise.resolve({ ...order, toObject: () => ({ ...order }) }) as any;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(["Accepted", "Preparing"])("sends socket and custom-sound push for %s", async (status) => {
    await notifyRidersOrderHeadsUp({ order: { ...order, status } });
    expect(emitSocketEvent).toHaveBeenCalledWith("rider:rider-1", "rider.order.headsup", expect.objectContaining({ orderId: "order-1" }));
    expect(sendPushToRider).toHaveBeenCalledWith(expect.objectContaining({ riderId: "rider-1", payload: expect.objectContaining({ channelId: "new-order-headsup", data: expect.objectContaining({ type: "order.headsup" }) }) }));
  });
  it.each([["New", "Accepted"], ["Accepted", "Preparing"]])("admin %s -> %s notifies riders", async (previous, next) => {
    order.status = previous;
    await updateAdminOrderStatus({ orderId: order.id, nextStatus: next as "Accepted" | "Preparing" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendPushToRider).toHaveBeenCalledTimes(1);
  });
  it("honors the admin notification toggle", async () => {
    content.operations.dispatch.riderHeadsUpEnabled = false;
    await notifyRidersOrderHeadsUp({ order });
    expect(sendPushToRider).not.toHaveBeenCalled();
  });
  it.each([["New", "Accepted"], ["Accepted", "Preparing"]])("owner %s -> %s notifies riders", async (previous, next) => {
    order.status = previous;
    jest.spyOn(OwnerModel, "findById").mockResolvedValue({ id: "owner-1", activeRestaurantId: "restaurant-1", restaurantLifecycleStatus: "approved" } as any);
    jest.spyOn(OrderModel, "findOne").mockReturnValue(query(order));
    await transitionOrder({ ownerId: "owner-1", orderId: order.id, nextStatus: next as "Accepted" | "Preparing", actor: "owner" });
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendPushToRider).toHaveBeenCalledTimes(1);
  });
  it("never notifies before acceptance", async () => {
    await notifyRidersOrderHeadsUp({ order: { ...order, status: "New" } });
    expect(sendPushToRider).not.toHaveBeenCalled();
  });
  it("does not send again when another transition already claimed the alert", async () => {
    jest.mocked(OrderModel.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    await notifyRidersOrderHeadsUp({ order });
    expect(sendPushToRider).not.toHaveBeenCalled();
    expect(emitSocketEvent).not.toHaveBeenCalledWith(expect.anything(), "rider.order.headsup", expect.anything());
    expect(OrderModel.updateOne).toHaveBeenCalledWith(expect.objectContaining({ "dispatchMeta.headsUp.notifiedAt": { $exists: false } }), expect.anything());
  });
});
