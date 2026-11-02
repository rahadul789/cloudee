import { buildRestaurantDiscoveryGeoNear } from "../src/modules/customer/restaurant-discovery-geo";

describe("zone-based restaurant discovery", () => {
  const base = {
    latitude: 24.9,
    longitude: 90.7,
    query: { status: "active" },
    fallbackRadiusKm: 5,
  };

  it("does not cut off the far side of a zone with a customer-centred radius", () => {
    const lookup = buildRestaurantDiscoveryGeoNear({ ...base, zoneBased: true, requestedRadiusKm: 1 });
    expect(lookup).not.toHaveProperty("maxDistance");
    expect(lookup.near.coordinates).toEqual([90.7, 24.9]);
    expect(lookup.query).toEqual(base.query);
    expect(lookup.distanceField).toBe("distanceMeters");
  });

  it("preserves the configured distance limit outside zone mode", () => {
    expect(buildRestaurantDiscoveryGeoNear({ ...base, zoneBased: false }).maxDistance).toBe(5000);
    expect(buildRestaurantDiscoveryGeoNear({ ...base, zoneBased: false, requestedRadiusKm: 2 }).maxDistance).toBe(2000);
    expect(buildRestaurantDiscoveryGeoNear({ ...base, zoneBased: false, requestedRadiusKm: 25 }).maxDistance).toBe(5000);
  });
});
