import { useEffect, useState } from "react";

import type { RestaurantAvailability } from "@/src/types/restaurant";

/**
 * Live-ticking remaining milliseconds until an absolute reopen instant. Because the
 * backend hands us an ABSOLUTE `opensAtEpochMs`, this stays correct across response
 * caching and device timezones — we only diff against the device clock.
 */
export function useCountdownMs(
  targetEpochMs: number | null | undefined,
  active = true,
): number {
  const [remaining, setRemaining] = useState(() =>
    typeof targetEpochMs === "number" ? Math.max(0, targetEpochMs - Date.now()) : 0,
  );

  useEffect(() => {
    if (typeof targetEpochMs !== "number") {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, targetEpochMs - Date.now()));
    tick();
    // When inactive (e.g. the sticky pill is scrolled out of view) we compute once but
    // skip the per-second interval, so a hidden countdown costs nothing.
    if (!active) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetEpochMs, active]);

  return remaining;
}

/**
 * "2h 15m" / "5m 30s" / "45s". Returns null when the reopen is further away than
 * `maxHours` — the caller then shows the plain "Opens at 11:00 AM" label instead of a
 * long ticking timer.
 */
export function formatCountdown(remainingMs: number, maxHours = 6): string | null {
  const totalSec = Math.floor(remainingMs / 1000);
  if (totalSec <= 0) return null;
  if (totalSec > maxHours * 3600) return null;
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export type ClosedCopy = {
  /** Primary line, e.g. "Opens 11:00 AM" or "Temporarily unavailable". */
  title: string;
  /** True when this closure has a known reopen time (show countdown). */
  hasReopen: boolean;
  opensAtLabel: string | null;
  opensAtEpochMs: number | null;
};

/**
 * Maps a restaurant's availability to what a closed card / header should say. A
 * deterministic closure (service window or the restaurant's own schedule) becomes
 * "Opens {time}" with a countdown; a manual pause / unknown reopen stays generic.
 */
export function getClosedCopy(
  availability: RestaurantAvailability | null | undefined,
): ClosedCopy {
  if (
    availability &&
    (availability.closedReason === "service_window" ||
      availability.closedReason === "schedule") &&
    availability.opensAtLabel
  ) {
    return {
      title: `Opens ${availability.opensAtLabel}`,
      hasReopen: true,
      opensAtLabel: availability.opensAtLabel,
      opensAtEpochMs: availability.opensAtEpochMs,
    };
  }
  return {
    title: "Temporarily unavailable",
    hasReopen: false,
    opensAtLabel: null,
    opensAtEpochMs: null,
  };
}
