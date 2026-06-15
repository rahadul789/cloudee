export type RiderLiveTrackingPolicy = {
  mode?: "balanced" | "battery_saver" | "high_accuracy";
  updateIntervalSeconds?: number;
  distanceIntervalMeters?: number;
  passiveHeartbeatSeconds?: number;
};

export const DEFAULT_RIDER_LIVE_TRACKING_POLICY = {
  mode: "balanced" as const,
  updateIntervalSeconds: 15,
  distanceIntervalMeters: 60,
  passiveHeartbeatSeconds: 60,
};

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function normalizeRiderLiveTrackingPolicy(
  policy?: RiderLiveTrackingPolicy | null,
) {
  return {
    mode: policy?.mode ?? DEFAULT_RIDER_LIVE_TRACKING_POLICY.mode,
    updateIntervalSeconds: clamp(
      policy?.updateIntervalSeconds,
      DEFAULT_RIDER_LIVE_TRACKING_POLICY.updateIntervalSeconds,
      10,
      60,
    ),
    distanceIntervalMeters: clamp(
      policy?.distanceIntervalMeters,
      DEFAULT_RIDER_LIVE_TRACKING_POLICY.distanceIntervalMeters,
      30,
      100,
    ),
    passiveHeartbeatSeconds: clamp(
      policy?.passiveHeartbeatSeconds,
      DEFAULT_RIDER_LIVE_TRACKING_POLICY.passiveHeartbeatSeconds,
      30,
      180,
    ),
  };
}
