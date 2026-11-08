jest.mock("../src/config/socket", () => ({ emitSocketEvent: jest.fn() }));
jest.mock("../src/modules/customer/push.service", () => ({ sendPushToCustomer: jest.fn() }));
import { extendAdminOrderPreparation } from "../src/modules/owner/operational.service";
import { OrderModel } from "../src/modules/owner/operational.model";
import { OwnerModel, RestaurantModel } from "../src/modules/auth/auth.model";
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

describe("admin preparation extension", () => {
  let order: any;
  beforeEach(() => {
    jest.clearAllMocks();
    order = { id: "order-1", _id: "order-1", orderNumber: "FB-1", restaurantId: "restaurant-1", customerId: "customer-1", riderId: "rider-1", status: "Preparing", timestamps: {}, preparationMeta: { startedAt: new Date(), baseMinutes: 20, extraMinutes: 5 }, serviceAreaSnapshot: { zoneId: "zone-a" }, toObject() { return { ...this }; } };
    const content = JSON.parse(JSON.stringify(platformContent));
    content.operations.dispatch.preparationMaxExtraMinutes = 20;
    jest.spyOn(contentService, "getPlatformContent").mockResolvedValue(content);
    jest.spyOn(areas, "getServiceAreaDispatchOverrides").mockResolvedValue(null);
    jest.spyOn(areas, "assertServiceAreaSnapshotMatchesScope").mockImplementation(() => undefined);
    jest.spyOn(OrderModel, "findById").mockReturnValue(query(order));
    jest.spyOn(OrderModel, "findOne").mockReturnValue(query(order));
    jest.spyOn(OwnerModel, "findOne").mockReturnValue(query(null));
    jest.spyOn(RestaurantModel, "findById").mockReturnValue(query(null));
    jest.spyOn(OrderModel, "findOneAndUpdate").mockImplementation((_filter: any, update: any) => { order.preparationMeta = update.$set.preparationMeta; return Promise.resolve(order) as any; });
  });
  afterEach(() => jest.restoreAllMocks());

  it("adds time, guards concurrent owner changes and publishes to the customer and rider", async () => {
    await extendAdminOrderPreparation({ orderId: order.id, minutes: 10, zoneId: "zone-a" });
    expect(order.preparationMeta.extraMinutes).toBe(15);
    expect(areas.assertServiceAreaSnapshotMatchesScope).toHaveBeenCalledWith(order.serviceAreaSnapshot, expect.objectContaining({ zoneId: "zone-a" }));
    expect(OrderModel.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "Preparing", $expr: { $eq: [{ $ifNull: ["$preparationMeta.extraMinutes", 0] }, 5] } }), expect.objectContaining({ $push: expect.objectContaining({ history: expect.objectContaining({ $each: [expect.objectContaining({ actor: "admin" })] }) }) }), { new: true });
    expect(emitSocketEvent).toHaveBeenCalledWith("customer:customer-1", "customer.order.updated", expect.objectContaining({ preparationMeta: expect.objectContaining({ extraMinutes: 15 }) }));
    expect(emitSocketEvent).toHaveBeenCalledWith("rider:rider-1", "rider.order.updated", expect.anything());
  });

  it("rejects extensions after the shared limit or after preparation has ended", async () => {
    order.preparationMeta.extraMinutes = 20;
    await expect(extendAdminOrderPreparation({ orderId: order.id, minutes: 5 })).rejects.toMatchObject({ code: "PREPARATION_EXTENSION_LIMIT_REACHED" });
    order.status = "ReadyForPickup";
    await expect(extendAdminOrderPreparation({ orderId: order.id, minutes: 5 })).rejects.toMatchObject({ code: "PREPARATION_EXTENSION_NOT_ALLOWED" });
    expect(OrderModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
