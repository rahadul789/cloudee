import { riderLocationSchema } from "../src/modules/rider/rider-location.schema";
import { getTrackingFreshnessMeta } from "../src/common/utils/tracking-freshness";

describe("rider location compatibility", () => {
  it("accepts valid coordinates from older clients with unavailable native metadata", () => {
    const payload = riderLocationSchema.parse({
      latitude: 23.8, longitude: 90.4, heading: -1, accuracyMeters: -1, speedKmph: -1,
    });
    expect(payload.latitude).toBe(23.8);
    expect(payload.heading).toBeUndefined();
    expect(payload.accuracyMeters).toBeUndefined();
    expect(payload.speedKmph).toBeUndefined();
  });

  it("keeps meaningful metadata including north heading and zero speed", () => {
    const payload = riderLocationSchema.parse({
      latitude: 23.8, longitude: 90.4, heading: 0, accuracyMeters: 12, speedKmph: 0,
    });
    expect(payload).toMatchObject({ heading: 0, accuracyMeters: 12, speedKmph: 0 });
  });

  it("rejects invalid coordinates and arbitrary invalid metadata", () => {
    for (const bad of [{ latitude: 91 }, { longitude: -181 }, { latitude: NaN },
      { heading: 361 }, { accuracyMeters: -20 }, { speedKmph: -20 }]) {
      expect(riderLocationSchema.safeParse({ latitude: 23.8, longitude: 90.4, ...bad }).success).toBe(false);
    }
  });

  it("distinguishes fresh, stale and completed deliveries", () => {
    const lastUpdatedAt = new Date(Date.now() - 25_000);
    expect(getTrackingFreshnessMeta({ status: "PickedUp", lastUpdatedAt }).state).toBe("live");
    expect(getTrackingFreshnessMeta({ status: "PickedUp", lastUpdatedAt: new Date(Date.now() - 180_000) }).state).toBe("stale");
    expect(getTrackingFreshnessMeta({ status: "Delivered", lastUpdatedAt }).state).toBe("unavailable");
  });
});
