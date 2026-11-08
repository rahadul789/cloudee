export function getCustomerTrackingFreshness(lastUpdatedAt?: string | null, nowMs = Date.now()) {
  const sampleAt = Date.parse(lastUpdatedAt ?? "");
  if (!Number.isFinite(sampleAt)) return "unavailable" as const;
  return nowMs - sampleAt > 120_000 ? "stale" as const : "live" as const;
}

export function shouldPollCustomerTracking(params: {
  socketConnected: boolean;
  status: string;
  isFocused?: boolean;
  lastUpdatedAt?: string | null;
  nowMs?: number;
}) {
  if (!params.socketConnected) return true;
  if (params.status !== "PickedUp" || params.isFocused === false) return false;
  const sampleAt = Date.parse(params.lastUpdatedAt ?? "");
  return !Number.isFinite(sampleAt) || (params.nowMs ?? Date.now()) - sampleAt > 45_000;
}
