import * as Location from "expo-location";

export type RiderLiveTrackingPolicy = {
  mode?: "balanced" | "battery_saver" | "high_accuracy";
  updateIntervalSeconds?: number;
  distanceIntervalMeters?: number;
  passiveHeartbeatSeconds?: number;
};

export const DEFAULT_RIDER_LIVE_TRACKING_POLICY = {
  mode: "balanced" as const,
  updateIntervalSeconds: 15,
  // Upload cadence is independent of GPS precision; stationary fixes still refresh.
  distanceIntervalMeters: 30,
  passiveHeartbeatSeconds: 25,
};

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

// Active deliveries need GPS precision. Upload work remains bounded by the
// native interval and the single-flight processing gate, independently of accuracy.
export function accuracyForMode(mode: string | undefined) {
  if (mode === "battery_saver") return Location.Accuracy.Balanced;
  return Location.Accuracy.High;
}

// One canonical config for the active-delivery background stream, so every caller
// (the bridge and the order screen) starts it with identical settings — that makes
// startRiderBackgroundLocationAsync idempotent and never restarts mid-delivery.
export function buildActiveTrackingConfig(
  policy: ReturnType<typeof normalizeRiderLiveTrackingPolicy>,
) {
  return {
    timeIntervalMs: Math.min(policy.updateIntervalSeconds, 30) * 1000,
    distanceIntervalMeters: policy.distanceIntervalMeters,
    heartbeatMs: Math.min(policy.passiveHeartbeatSeconds, 30) * 1000,
    accuracy: accuracyForMode(policy.mode),
  };
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
      20,
      100,
    ),
    passiveHeartbeatSeconds: clamp(
      policy?.passiveHeartbeatSeconds,
      DEFAULT_RIDER_LIVE_TRACKING_POLICY.passiveHeartbeatSeconds,
      15,
      45,
    ),
  };
}
