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
  distanceIntervalMeters: 60,
  passiveHeartbeatSeconds: 60,
};

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

// GPS-grade accuracy per admin mode. Even "balanced" maps to High (GPS), NOT the
// network/coarse tier — a live delivery marker must sit on the road, and coarse
// network fixes drift by hundreds of metres (the long-distance jitter). High mode
// uses BestForNavigation; battery-saver drops to Balanced.
export function accuracyForMode(mode: string | undefined) {
  if (mode === "high_accuracy") return Location.Accuracy.BestForNavigation;
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
    timeIntervalMs: policy.updateIntervalSeconds * 1000,
    distanceIntervalMeters: policy.distanceIntervalMeters,
    heartbeatMs:
      Math.min(Math.max(policy.updateIntervalSeconds * 2, 30), 90) * 1000,
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
