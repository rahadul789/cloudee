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

import { isSocketAuthError, resolveTrackingTuning } from "./tracking-freshness";

describe("backend-tunable tracking", () => {
  const now = Date.parse("2026-11-11T10:00:00Z");
  it("uses shipped defaults when the backend sends nothing", () => {
    expect(resolveTrackingTuning(undefined)).toEqual({ fallbackPollSeconds: 25, staleAfterSeconds: 120, refetchIfQuietSeconds: 45 });
  });
  it("clamps bad admin values to safe ranges", () => {
    expect(resolveTrackingTuning({ fallbackPollSeconds: 0, staleAfterSeconds: 99999, refetchIfQuietSeconds: Number.NaN }))
      .toEqual({ fallbackPollSeconds: 5, staleAfterSeconds: 900, refetchIfQuietSeconds: 45 });
  });
  it("honours a tuned stale window and quiet window", () => {
    expect(getCustomerTrackingFreshness(new Date(now - 90_000).toISOString(), now, 60)).toBe("stale");
    expect(shouldPollCustomerTracking({ socketConnected: true, status: "PickedUp", lastUpdatedAt: new Date(now - 20_000).toISOString(), nowMs: now, refetchIfQuietSeconds: 15 })).toBe(true);
  });
  it("recognises the server's socket auth rejections only", () => {
    expect(isSocketAuthError(new Error("Invalid socket access token"))).toBe(true);
    expect(isSocketAuthError(new Error("Socket session is not active"))).toBe(true);
    expect(isSocketAuthError(new Error("xhr poll error"))).toBe(false);
  });
});
