// Live-tracking timing rules. Defaults below are the shipped behaviour; the backend can tune
// them per platform (admin → Settings → Customer live tracking → operations.customerTracking)
// so a tracking problem can be fixed without an app release.

export type CustomerTrackingTuning = {
  /** How often the tracking screen ticks / polls as a socket fallback. */
  fallbackPollSeconds?: number;
  /** A rider location older than this is shown as "stale". */
  staleAfterSeconds?: number;
  /** Socket connected but no rider ping for this long while on the way → refetch. */
  refetchIfQuietSeconds?: number;
};

export const DEFAULT_TRACKING_TUNING = {
  fallbackPollSeconds: 25,
  staleAfterSeconds: 120,
  refetchIfQuietSeconds: 45,
} as const;

const clampSeconds = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Admin values sanitised + clamped to safe ranges (bad config can never break tracking). */
export function resolveTrackingTuning(input?: CustomerTrackingTuning | null) {
  return {
    fallbackPollSeconds: clampSeconds(input?.fallbackPollSeconds, DEFAULT_TRACKING_TUNING.fallbackPollSeconds, 5, 120),
    staleAfterSeconds: clampSeconds(input?.staleAfterSeconds, DEFAULT_TRACKING_TUNING.staleAfterSeconds, 30, 900),
    refetchIfQuietSeconds: clampSeconds(input?.refetchIfQuietSeconds, DEFAULT_TRACKING_TUNING.refetchIfQuietSeconds, 10, 600),
  };
}

export function getCustomerTrackingFreshness(
  lastUpdatedAt?: string | null,
  nowMs = Date.now(),
  staleAfterSeconds: number = DEFAULT_TRACKING_TUNING.staleAfterSeconds,
) {
  const sampleAt = Date.parse(lastUpdatedAt ?? "");
  if (!Number.isFinite(sampleAt)) return "unavailable" as const;
  return nowMs - sampleAt > staleAfterSeconds * 1000 ? "stale" as const : "live" as const;
}

export function shouldPollCustomerTracking(params: {
  socketConnected: boolean;
  status: string;
  isFocused?: boolean;
  lastUpdatedAt?: string | null;
  nowMs?: number;
  refetchIfQuietSeconds?: number;
}) {
  if (!params.socketConnected) return true;
  if (params.status !== "PickedUp" || params.isFocused === false) return false;
  const sampleAt = Date.parse(params.lastUpdatedAt ?? "");
  const quietMs = (params.refetchIfQuietSeconds ?? DEFAULT_TRACKING_TUNING.refetchIfQuietSeconds) * 1000;
  return !Number.isFinite(sampleAt) || (params.nowMs ?? Date.now()) - sampleAt > quietMs;
}

/** Socket handshake rejected by the server's auth middleware (expired/invalid token). */
export function isSocketAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /token|session|unauthori[sz]ed|jwt/i.test(message);
}
