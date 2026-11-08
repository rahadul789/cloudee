import { getCustomerTrackingFreshness, shouldPollCustomerTracking } from "./tracking-freshness";

describe("customer live location recovery", () => {
  const now = Date.now();
  it("polls when a connected socket has stopped delivering rider locations", () => {
    expect(shouldPollCustomerTracking({ socketConnected: true, status: "PickedUp", lastUpdatedAt: new Date(now - 60_000).toISOString(), nowMs: now })).toBe(true);
    expect(shouldPollCustomerTracking({ socketConnected: true, status: "PickedUp", lastUpdatedAt: new Date(now - 10_000).toISOString(), nowMs: now })).toBe(false);
  });
  it("recovers a missing first sample, but respects the rider's delivery queue", () => {
    expect(shouldPollCustomerTracking({ socketConnected: true, status: "PickedUp" })).toBe(true);
    expect(shouldPollCustomerTracking({ socketConnected: true, status: "PickedUp", isFocused: false })).toBe(false);
  });
  it("does not call an old or missing coordinate live", () => {
    expect(getCustomerTrackingFreshness(undefined, now)).toBe("unavailable");
    expect(getCustomerTrackingFreshness(new Date(now - 121_000).toISOString(), now)).toBe("stale");
    expect(getCustomerTrackingFreshness(new Date(now - 15_000).toISOString(), now)).toBe("live");
  });
  it("polls if the socket disconnects even before pickup", () => {
    expect(shouldPollCustomerTracking({ socketConnected: false, status: "Preparing" })).toBe(true);
  });
});
