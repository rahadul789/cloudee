jest.mock("../src/config/socket", () => ({ emitSocketEvent: jest.fn() }));
jest.mock("../src/modules/rider/push.service", () => ({ sendPushToRider: jest.fn().mockResolvedValue({ sent: 1 }) }));
jest.mock("../src/modules/customer/push.service", () => ({ sendPushToCustomer: jest.fn() }));

import { RiderModel, RestaurantModel, OwnerModel } from "../src/modules/auth/auth.model";
import { OrderModel } from "../src/modules/owner/operational.model";
import { transitionOrderBySystem } from "../src/modules/owner/operational.service";
import { runAutoDispatchForReadyOrders } from "../src/modules/admin/orders-monitor.service";
import * as contentService from "../src/modules/public/content.service";
import { platformContent } from "../src/modules/public/content";
import * as areas from "../src/modules/service-area/service-area.service";
import { emitSocketEvent } from "../src/config/socket";

function query(data: any): any {
  const chain: any = {};
  for (const method of ["select", "sort", "limit"]) chain[method] = () => chain;
  chain.lean = async () => data;
  chain.then = (resolve: any, reject: any) => Promise.resolve(data).then(resolve, reject);
  return chain;
}

describe("rider food-ready assignment", () => {
  let order: any;
  beforeEach(() => {
    jest.clearAllMocks();
    order = { _id: "order-1", id: "order-1", orderNumber: "FB-1", status: "Preparing", riderId: "", restaurantId: "restaurant-1", customerId: "customer-1", timestamps: {}, dispatchMeta: { existing: true },
      get(key: string) { return this[key]; }, toObject() { return { ...this }; } };
    jest.spyOn(contentService, "getPlatformContent").mockResolvedValue(platformContent as any);
    jest.spyOn(areas, "getServiceAreaDispatchOverrides").mockResolvedValue(null);
    jest.spyOn(areas, "assertRiderAllowedForServiceArea").mockImplementation(() => undefined);
    jest.spyOn(RiderModel, "findById").mockResolvedValue({ id: "rider-1", status: "active", isAvailableForAssignments: true, fullName: "Rider One", phone: "test", vehicleType: "bike" } as any);
    jest.spyOn(RestaurantModel, "findById").mockReturnValue(query(null));
    jest.spyOn(OwnerModel, "findOne").mockResolvedValue(null);
    jest.spyOn(OrderModel, "findById").mockImplementation(() => query(order));
    jest.spyOn(OrderModel, "findOneAndUpdate").mockImplementation((_filter: any, update: any) => {
      order = { ...order, ...update.$set };
      return Promise.resolve(order) as any;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("atomically assigns the confirming rider together with the ready status", async () => {
    const result = await transitionOrderBySystem({ orderId: order.id, nextStatus: "ReadyForPickup", actor: "rider", readyConfirmedByRiderId: "rider-1" });
    expect(result).toMatchObject({ status: "ReadyForPickup", riderId: "rider-1", riderSnapshot: { name: "Rider One" }, dispatchMeta: { existing: true, assignedAt: expect.any(Date), acknowledgedAt: expect.any(Date) } });
    expect(OrderModel.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "Preparing", $or: expect.arrayContaining([{ riderId: "rider-1" }, { riderId: "" }]) }), expect.objectContaining({ $set: expect.objectContaining({ status: "ReadyForPickup", riderId: "rider-1" }) }), { new: true });
    expect(emitSocketEvent).toHaveBeenCalledWith("rider:rider-1", "rider.order.updated", expect.objectContaining({ riderId: "rider-1" }));
  });

  it("does not overwrite another rider when assignment changes concurrently", async () => {
    jest.mocked(OrderModel.findOneAndUpdate).mockResolvedValue(null);
    await expect(transitionOrderBySystem({ orderId: order.id, nextStatus: "ReadyForPickup", actor: "rider", readyConfirmedByRiderId: "rider-1" })).rejects.toMatchObject({ code: "ORDER_STATUS_CHANGED" });
    expect(emitSocketEvent).not.toHaveBeenCalled();
  });

  it("does not automatically reassign an acknowledged food-ready order after a timeout", async () => {
    const content = JSON.parse(JSON.stringify(platformContent));
    Object.assign(content.operations.dispatch, { autoAssignmentEnabled: true, autoReassignTimedOutOrders: true, assignmentTimeoutMinutes: 1 });
    jest.mocked(contentService.getPlatformContent).mockResolvedValue(content);
    order.status = "ReadyForPickup";
    order.riderId = "rider-1";
    order.dispatchMeta = { assignedAt: new Date(Date.now() - 3_600_000), acknowledgedAt: new Date(Date.now() - 3_600_000) };
    jest.spyOn(OrderModel, "find").mockReturnValue(query([order]));
    const result = await runAutoDispatchForReadyOrders();
    expect(result.assigned).toBe(0);
    expect(RestaurantModel.findById).not.toHaveBeenCalled();
    expect(OrderModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
