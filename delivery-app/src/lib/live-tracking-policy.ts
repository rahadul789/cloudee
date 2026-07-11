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
  // Tighter last-mile cadence. A 60m move threshold + 60s heartbeat made a slow /
  // near-stationary rider (walking the last block, waiting at a gate) update the
  // customer only once a minute — that was the "location shares but is slow" report.
  // 30m/25s keeps the customer marker + ETA fresh without touching accuracy (still
  // Balanced), so the documented "High accuracy froze the JS thread" regression stays
  // fixed.
  distanceIntervalMeters: 30,
  passiveHeartbeatSeconds: 25,
};

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

// Accuracy per admin mode. IMPORTANT: the default ("balanced") maps to Balanced, NOT
// High. A regression that pushed "balanced" up to High made the OS stream GPS fixes
// almost continuously, and since each fix runs work on the JS thread that froze the whole
// app after pickup. Balanced still places the marker on the road for delivery but lets
// the OS deliver on the requested interval instead of firing constantly. Only the
// explicit "high_accuracy" admin mode opts into the heavier continuous GPS.
export function accuracyForMode(mode: string | undefined) {
  if (mode === "high_accuracy") return Location.Accuracy.High;
  if (mode === "battery_saver") return Location.Accuracy.Low;
  return Location.Accuracy.Balanced;
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
    heartbeatMs: policy.passiveHeartbeatSeconds * 1000,
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
      180,
    ),
  };
}
