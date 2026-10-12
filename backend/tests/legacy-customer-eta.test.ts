import { applyEtaHandoverBuffer, customerDeliveryRoute, getRiderEtaSettings } from "../src/common/utils/delivery-eta";

describe("unchanged Play Store customer ETA compatibility", () => {
  const route = { durationMinutes: 4, distanceKm: 1.1, polyline: "road", provider: "google" };

  it("puts delivery time into the existing route field without changing cached travel time", () => {
    const result = customerDeliveryRoute(route, applyEtaHandoverBuffer(4, 1.1, 6));
    expect(result?.durationMinutes).toBe(10);
    expect(result?.travelDurationMinutes).toBe(4);
    expect(route.durationMinutes).toBe(4);
    expect(result?.polyline).toBe("road");
  });

  it("tapers the same configurable buffer for REST and socket delivery estimates", () => {
    expect(applyEtaHandoverBuffer(4, 0.25, 10)).toBe(9);
    expect(applyEtaHandoverBuffer(1, 0, 10)).toBe(1);
    expect(applyEtaHandoverBuffer(4, 1.1, 0)).toBe(4);
    const settings = getRiderEtaSettings({ operations: { dispatch: { riderEtaHandoverBufferMinutes: 20 } } });
    expect(customerDeliveryRoute(route, applyEtaHandoverBuffer(4, 1.1, settings.handoverBufferMinutes))?.durationMinutes).toBe(24);
  });

  it("preserves fallback routes so legacy cache merging clears a stale road polyline", () => {
    expect(customerDeliveryRoute({ ...route, polyline: "", provider: "haversine" }, 14)?.polyline).toBe("");
    expect(customerDeliveryRoute(null, 14)).toBeNull();
  });
});
