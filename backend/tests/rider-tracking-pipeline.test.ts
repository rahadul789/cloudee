import { RiderModel, RestaurantModel } from "../src/modules/auth/auth.model";
import { OrderModel } from "../src/modules/owner/operational.model";
import * as operations from "../src/modules/owner/operational.service";
import * as content from "../src/modules/public/content.service";
import { platformContent } from "../src/modules/public/content";
import * as socket from "../src/config/socket";
import * as routing from "../src/modules/routing/routing.service";
import * as areas from "../src/modules/service-area/service-area.service";
import { pickupRiderOrder, updateRiderLastKnownLocation } from "../src/modules/rider/rider.service";
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

  it.each(["pickup GPS", "recent online GPS"])("publishes the first pickup coordinate from %s to the customer", async (source) => {
    const rider: any = { id: "rider-pickup", status: "active", verification: { status: "approved" },
      fullName: "Rider", phone: "test", activeTrackingOrderId: "", save: jest.fn() };
    if (source === "recent online GPS") rider.lastKnownLocation = {
      latitude: 23.8, longitude: 90.4, accuracyMeters: 12, updatedAt: new Date(Date.now() - 20_000),
    };
    const order: any = { _id: "trip-pickup", id: "trip-pickup", riderId: rider.id,
      status: "ReadyForPickup", restaurantId: "restaurant", customerId: "customer", timestamps: {},
      riderTracking: { lastUpdatedAt: new Date(Date.now() - 600_000) },
      get(key: string) { return this[key]; },
      set(key: string, value: unknown) { this[key] = value; },
      save: jest.fn(),
      toObject() { return { ...this }; },
    };
    jest.spyOn(RiderModel, "findById").mockResolvedValue(rider);
    jest.spyOn(RiderModel, "findByIdAndUpdate").mockResolvedValue({ ...rider, activeTrackingOrderId: order.id });
    jest.spyOn(OrderModel, "findById").mockReturnValue(query(order));
    jest.spyOn(OrderModel, "find").mockReturnValue(query([]));
    jest.spyOn(OrderModel, "updateMany").mockResolvedValue({} as any);
    jest.spyOn(OrderModel, "updateOne").mockResolvedValue({} as any);
    jest.spyOn(RestaurantModel, "findById").mockReturnValue(query(null));
    jest.spyOn(content, "getPlatformContent").mockResolvedValue(platformContent as any);
    jest.spyOn(areas, "assertRiderAllowedForServiceArea").mockImplementation(() => undefined);
    jest.spyOn(routing, "getOrderRouteMetrics").mockResolvedValue(null);
    jest.spyOn(socket, "emitSocketEvent").mockImplementation(() => undefined);
    jest.spyOn(operations, "transitionOrderBySystem").mockImplementation(async () => {
      order.status = "PickedUp";
      return order;
    });
    const publish = jest.spyOn(operations, "emitOrderRealtimeUpdate").mockResolvedValue(undefined);
    const result = await pickupRiderOrder({ riderId: rider.id, orderId: order.id,
      location: source === "pickup GPS" ? { latitude: 23.8, longitude: 90.4, accuracyMeters: 12 } : undefined });
    expect(result.riderTracking.freshness.state).toBe("live");
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      riderTracking: expect.objectContaining({ lastUpdatedAt: expect.any(Date),
        currentLocation: expect.objectContaining({ latitude: 23.8, longitude: 90.4 }) }),
    }), expect.objectContaining({ type: "order.pickup_location" }));
    if (source === "recent online GPS") expect(result.riderTracking.freshness.ageSeconds).toBeGreaterThanOrEqual(20);
  });

  it("persists profile location and notifies admin without waiting for route work", async () => {
    const rider: any = {
      id: "rider-1", fullName: "Test Rider", phone: "test", status: "active",
      verification: { status: "approved" }, activeTrackingOrderId: "", save: jest.fn(),
    };
    jest.spyOn(RiderModel, "findById").mockResolvedValue(rider);
    jest.spyOn(RiderModel, "updateOne").mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as any);
    jest.spyOn(OrderModel, "find").mockReturnValue(query([]));
    const events = jest.spyOn(socket, "emitSocketEvent").mockImplementation(() => undefined);
    const result = await updateRiderLastKnownLocation({ riderId: rider.id, latitude: 23.8, longitude: 90.4 });
    expect(RiderModel.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: rider.id }),
      expect.objectContaining({ $set: expect.objectContaining({ lastKnownLocation: expect.objectContaining({ latitude: 23.8 }) }) }));
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
    const route = jest.spyOn(operations, "updateOrderRiderLocation").mockResolvedValue({ toObject: () => ({ status: "PickedUp" }) } as any);
    const write = jest.spyOn(RiderModel, "updateOne").mockResolvedValue({} as any);
    await updateRiderLastKnownLocation({ riderId: rider.id, latitude: 23.801, longitude: 90.401 });
    const receivedAt = rider.lastKnownLocation.updatedAt;
    await jest.advanceTimersByTimeAsync(1);
    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith(expect.objectContaining({ orderId: "trip-focused", latitude: 23.801 }));
    expect(socket.emitSocketEvent).toHaveBeenCalledWith("rider:rider-queue", "rider.location.updated", expect.objectContaining({ orderId: "trip-focused" }));
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      $or: expect.arrayContaining([{ "lastKnownLocation.updatedAt": { $lte: receivedAt } }]),
    }), expect.objectContaining({ $set: { lastKnownLocation: expect.objectContaining({ updatedAt: receivedAt }) } }));
  });

  it("does not let an older locked-screen sample overwrite a newer rider position", async () => {
    const at = new Date();
    const rider: any = { id: "rider-older", status: "active", verification: { status: "approved" },
      lastKnownLocation: { latitude: 23.8, longitude: 90.4, updatedAt: at }, save: jest.fn() };
    jest.spyOn(RiderModel, "findById").mockResolvedValue(rider);
    await updateRiderLastKnownLocation({ riderId: rider.id, latitude: 24, longitude: 91,
      recordedAt: new Date(at.getTime() - 30_000).toISOString() });
    expect(rider.save).not.toHaveBeenCalled();
    expect(rider.lastKnownLocation.latitude).toBe(23.8);
  });

  it("keeps capture time in the atomic rider profile write", async () => {
    const at = new Date(Date.now() - 20_000);
    const rider: any = { id: "rider-capture", status: "active", verification: { status: "approved" },
      activeTrackingOrderId: "", save: jest.fn() };
    jest.spyOn(RiderModel, "findById").mockResolvedValue(rider);
    jest.spyOn(OrderModel, "find").mockReturnValue(query([]));
    const write = jest.spyOn(RiderModel, "updateOne").mockResolvedValue({ matchedCount: 1 } as any);
    jest.spyOn(socket, "emitSocketEvent").mockImplementation(() => undefined);
    const result = await updateRiderLastKnownLocation({ riderId: rider.id, latitude: 23.8, longitude: 90.4, recordedAt: at.toISOString() });
    expect(result.lastKnownLocation?.updatedAt).toBe(at.toISOString());
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ $or: expect.arrayContaining([
      { "lastKnownLocation.updatedAt": { $lte: at } },
    ]) }), expect.objectContaining({ $set: expect.objectContaining({ lastKnownLocation: expect.objectContaining({ updatedAt: at }) }) }));
  });

  it("cannot save a delayed GPS result after the delivery has ended", async () => {
    const at = new Date();
    const order: any = { id: "trip-ended", _id: "trip-ended", status: "PickedUp", riderId: "rider", customerId: "customer",
      customerSnapshot: { deliveryAddress: { latitude: 23.82, longitude: 90.42 } },
      get: () => ({}), timestamps: { PickedUp: at } };
    const ended: any = { ...order, status: "Delivered" };
    jest.spyOn(OrderModel, "findById").mockResolvedValueOnce(order).mockResolvedValueOnce(ended);
    const write = jest.spyOn(OrderModel, "findOneAndUpdate").mockResolvedValue(null);
    jest.spyOn(content, "getPlatformContent").mockResolvedValue(platformContent as any);
    jest.spyOn(routing, "getOrderRouteMetrics").mockResolvedValue(null);
    const events = jest.spyOn(socket, "emitSocketEvent").mockImplementation(() => undefined);
    const result = await operations.updateOrderRiderLocation({ orderId: order.id, actor: "rider", latitude: 23.8, longitude: 90.4, recordedAt: at.toISOString() });
    expect(result.status).toBe("Delivered");
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ status: "PickedUp", riderId: "rider", $or: expect.arrayContaining([
      { "riderTracking.lastUpdatedAt": { $lte: at } },
    ]) }), expect.anything(), { new: true });
    expect(events).not.toHaveBeenCalled();
  });

  it("retries a recent queued fix after transient storage failure", async () => {
    jest.useFakeTimers();
    const rider: any = { id: "rider-retry", status: "active", verification: { status: "approved" },
      activeTrackingOrderId: "trip-retry", save: jest.fn() };
    jest.spyOn(RiderModel, "findById").mockResolvedValue(rider);
    jest.spyOn(OrderModel, "find").mockReturnValue(query([{ id: "trip-retry" }]));
    jest.spyOn(RiderModel, "updateOne").mockResolvedValue({} as any);
    jest.spyOn(socket, "emitSocketEvent").mockImplementation(() => undefined);
    const route = jest.spyOn(operations, "updateOrderRiderLocation")
      .mockRejectedValueOnce(new Error("Temporary storage failure"))
      .mockResolvedValue({ toObject: () => ({ riderTracking: { lastUpdatedAt: new Date() } }) } as any);
    await updateRiderLastKnownLocation({ riderId: rider.id, latitude: 23.8, longitude: 90.4 });
    await jest.advanceTimersByTimeAsync(1);
    expect(route).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(route).toHaveBeenCalledTimes(2);
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
