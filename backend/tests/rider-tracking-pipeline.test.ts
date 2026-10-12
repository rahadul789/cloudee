import { RiderModel, RestaurantModel } from "../src/modules/auth/auth.model";
import { OrderModel } from "../src/modules/owner/operational.model";
import * as operations from "../src/modules/owner/operational.service";
import * as content from "../src/modules/public/content.service";
import { platformContent } from "../src/modules/public/content";
import * as socket from "../src/config/socket";
import { updateRiderLastKnownLocation } from "../src/modules/rider/rider.service";
import { getAdminLiveMap, invalidateAdminMonitoringCaches } from "../src/modules/admin/orders-monitor.service";

function query(data: unknown) {
  const chain: Record<string, any> = {};
  for (const method of ["sort", "select", "limit"]) chain[method] = () => chain;
  chain.lean = () => Promise.resolve(data);
  chain.then = (resolve: any, reject: any) => Promise.resolve(data).then(resolve, reject);
  return chain as any;
}

describe("rider location to admin tracking pipeline", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    invalidateAdminMonitoringCaches();
  });

  it("persists profile location and notifies admin without waiting for route work", async () => {
    const rider: any = {
      id: "rider-1", fullName: "Test Rider", phone: "test", status: "active",
      verification: { status: "approved" }, activeTrackingOrderId: "", save: jest.fn(),
    };
    jest.spyOn(RiderModel, "findById").mockResolvedValue(rider);
    jest.spyOn(OrderModel, "find").mockReturnValue(query([]));
    const events = jest.spyOn(socket, "emitSocketEvent").mockImplementation(() => undefined);
    const result = await updateRiderLastKnownLocation({ riderId: rider.id, latitude: 23.8, longitude: 90.4 });
    expect(rider.save).toHaveBeenCalledTimes(1);
    expect(result.lastKnownLocation).toMatchObject({ latitude: 23.8, longitude: 90.4 });
    expect(events).toHaveBeenCalledWith("admin:live-map", "admin.live-map.updated",
      expect.objectContaining({ type: "rider.location", riderId: rider.id }));
  });

  it("queues only the focused trip and guards late rider writes by receipt time", async () => {
    jest.useFakeTimers();
    const rider: any = {
      id: "rider-queue", fullName: "Test Rider", phone: "test", status: "active",
      verification: { status: "approved" }, activeTrackingOrderId: "trip-focused", save: jest.fn(),
    };
    jest.spyOn(RiderModel, "findById").mockResolvedValue(rider);
    jest.spyOn(OrderModel, "find").mockReturnValue(query([{ id: "trip-queued" }, { id: "trip-focused" }]));
    jest.spyOn(socket, "emitSocketEvent").mockImplementation(() => undefined);
    const route = jest.spyOn(operations, "updateOrderRiderLocation").mockResolvedValue({ toObject: () => ({}) } as any);
    const write = jest.spyOn(RiderModel, "updateOne").mockResolvedValue({} as any);
    await updateRiderLastKnownLocation({ riderId: rider.id, latitude: 23.801, longitude: 90.401 });
    const receivedAt = rider.lastKnownLocation.updatedAt;
    await jest.advanceTimersByTimeAsync(1);
    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith(expect.objectContaining({ orderId: "trip-focused", latitude: 23.801 }));
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      $or: expect.arrayContaining([{ "lastKnownLocation.updatedAt": { $lte: receivedAt } }]),
    }), expect.objectContaining({ $set: { lastKnownLocation: expect.objectContaining({ updatedAt: receivedAt }) } }));
  });

  it("admin snapshot exposes updated rider coordinates, timestamp and focused order", async () => {
    jest.spyOn(content, "getPlatformContent").mockResolvedValue(platformContent as any);
    const rider = {
      _id: "rider-admin", fullName: "Test Rider", status: "active", activeTrackingOrderId: "trip-second",
      lastKnownLocation: { latitude: 23.8, longitude: 90.4, updatedAt: new Date(), speedKmph: 12 },
    };
    const restaurant = { _id: "restaurant-1", name: "Test Restaurant", location: { latitude: 23.81, longitude: 90.41 } };
    const orders = ["trip-first", "trip-second"].map((id) => ({
      _id: id, riderId: rider._id, restaurantId: restaurant._id, status: "PickedUp", orderNumber: id,
      createdAt: new Date(), updatedAt: new Date(), timestamps: { PickedUp: new Date() },
      customerSnapshot: { deliveryAddress: { latitude: 23.82, longitude: 90.42 } },
      riderTracking: { isActive: true, isFocused: id === "trip-second", remainingDurationMinutes: 14 },
    }));
    jest.spyOn(RiderModel, "countDocuments").mockResolvedValue(1);
    jest.spyOn(RiderModel, "find").mockReturnValue(query([rider]));
    jest.spyOn(RestaurantModel, "find").mockReturnValue(query([restaurant]));
    jest.spyOn(OrderModel, "find").mockReturnValue(query(orders));
    const first = await getAdminLiveMap();
    expect(first.riders[0]).toMatchObject({ liveOrderId: "trip-second", currentLocation: {
      latitude: 23.8, longitude: 90.4, lastUpdatedAt: rider.lastKnownLocation.updatedAt.toISOString(),
    } });
    expect(first.deliveries[0].rider.location.latitude).toBe(23.8);
    rider.lastKnownLocation = { ...rider.lastKnownLocation, latitude: 23.805, updatedAt: new Date() };
    invalidateAdminMonitoringCaches();
    const next = await getAdminLiveMap();
    expect(next.riders[0].currentLocation.latitude).toBe(23.805);
    expect(next.deliveries[0].rider.location.latitude).toBe(23.805);
  });
});
