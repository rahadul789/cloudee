// What the rider should read about the kitchen, from the backend's prep timing:
//   cooking, target ahead  → "Ready in ~5 min"
//   cooking, target passed → "Kitchen 7 min late"   (was a vague "Ready any moment")
//   ready for pickup       → "Ready for 12 min"     (how long the food has been waiting)
// Pure + clock-injected so it can be ticked from the UI.

export type PrepTiming = {
  phase?: string;
  label?: string;
  targetReadyAt?: string | null;
  readyAt?: string | null;
  remainingSeconds?: number | null;
};

export type PrepInfo =
  | { kind: "ready_in"; minutes: number }
  | { kind: "late"; minutes: number }
  | { kind: "ready_for"; minutes: number }
  | { kind: "any_moment" }
  | { kind: "preparing" };

const COOKING = new Set(["Accepted", "Preparing"]);

function parse(iso?: string | null) {
  const at = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(at) ? at : null;
}

export function getPrepInfo(params: {
  status: string;
  preparation?: PrepTiming | null;
  timestamps?: Record<string, string> | null;
  now?: number;
}): PrepInfo | null {
  const now = params.now ?? Date.now();
  if (params.status === "ReadyForPickup") {
    const readyAt =
      parse(params.preparation?.readyAt) ??
      parse(params.timestamps?.ReadyForPickup) ??
      parse(params.timestamps?.readyForPickupAt);
    if (readyAt === null) return null;
    return { kind: "ready_for", minutes: Math.max(0, Math.floor((now - readyAt) / 60_000)) };
  }
  if (!COOKING.has(params.status)) return null;
  const target = parse(params.preparation?.targetReadyAt);
  if (target === null) return { kind: "preparing" };
  const diffMs = target - now;
  if (diffMs > 0) return { kind: "ready_in", minutes: Math.max(1, Math.ceil(diffMs / 60_000)) };
  const lateMin = Math.floor(-diffMs / 60_000);
  return lateMin < 1 ? { kind: "any_moment" } : { kind: "late", minutes: lateMin };
}

/** Food waiting this long at the counter is urgent for the rider. */
export const READY_WAITING_URGENT_MIN = 10;
