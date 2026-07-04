// Shared GPS-quality gate for every place the rider app captures a fix (the
// foreground watcher and the background TaskManager job). A stationary phone
// regularly emits garbage fixes — a huge accuracy radius or a fix that "teleports"
// hundreds of metres and snaps back a few seconds later. Sending those makes the
// rider marker (and therefore the customer's live map) jump wildly. We drop them
// at the source so both apps only ever see plausible positions.

// Reject fixes less precise than this. Real High-accuracy GPS is <20m; Balanced is
// ~30-65m. 120m is lenient enough to keep normal fixes but cuts the worst drift.
export const MAX_ACCURACY_METERS = 120;
// A bike tops out well under this (~144 km/h). Anything faster over a real gap is a
// GPS glitch, not movement.
export const MAX_PLAUSIBLE_SPEED_MPS = 40;
// Ignore tiny jitter for the speed check; only large jumps can be teleports.
export const MIN_TELEPORT_JUMP_METERS = 60;
// If we keep rejecting, the reference fix itself was probably bad — accept the next
// one to re-baseline instead of freezing the marker forever.
export const MAX_CONSECUTIVE_REJECTS = 4;

export type AcceptedFix = {
  latitude: number;
  longitude: number;
  atMs: number;
};

export function metersBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadius = 6_371_000;
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180;
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Decide whether a raw GPS fix is trustworthy enough to send. `consecutiveRejects`
 * is the number of fixes rejected in a row since the last accepted one — the caller
 * tracks it and passes it in, so the escape hatch can re-baseline after a bad
 * reference. Returns whether to accept; the caller updates its last-accepted fix and
 * reject counter accordingly.
 */
export function shouldAcceptFix(params: {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  nowMs: number;
  last: AcceptedFix | null;
  consecutiveRejects: number;
}): boolean {
  const escapeHatch = params.consecutiveRejects >= MAX_CONSECUTIVE_REJECTS;

  if (
    !escapeHatch &&
    typeof params.accuracyMeters === "number" &&
    params.accuracyMeters > MAX_ACCURACY_METERS
  ) {
    return false;
  }

  if (!params.last) return true;

  const jump = metersBetween(params.last, params);
  if (!escapeHatch && jump > MIN_TELEPORT_JUMP_METERS) {
    const elapsedSec = Math.max((params.nowMs - params.last.atMs) / 1000, 1);
    const impliedSpeed = jump / elapsedSec;
    if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MPS) {
      return false;
    }
  }

  return true;
}
