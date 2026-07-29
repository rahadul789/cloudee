import { useEffect, useRef, useState } from "react";

import type { RestaurantAvailability } from "@/src/types/restaurant";

/**
 * Auto-refreshes a closed screen when its service window opens: the backend hands us the
 * absolute reopen instant (`targetEpochMs`) and this calls `onReopen` (the screen's refetch)
 * the moment it passes — so a customer sitting on the "Opens in …" countdown sees the area +
 * restaurants flip to open on their own, no pull-to-refresh. (The backend now computes
 * open/closed live, so a single refetch after the boundary already returns "open".)
 *
 * Uses a 1-second tick — a short, reliable interval; a single long `setTimeout` gets
 * throttled/GC'd by RN and never fires. It only refetches once the instant is reached, then
 * retries a few times ~4s apart to absorb small device/server clock skew. A null/absent
 * instant (area already open) is a no-op, and the area opening clears the instant → this tears
 * down and stops.
 */
export function useReopenAutoRefresh(
  targetEpochMs: number | null | undefined,
  onReopen: () => void,
) {
  const onReopenRef = useRef(onReopen);
  useEffect(() => {
    onReopenRef.current = onReopen;
  }, [onReopen]);

  useEffect(() => {
    if (typeof targetEpochMs !== "number") return;

    let fires = 0;
    let lastFireAt = 0;
    const id = setInterval(() => {
      const now = Date.now();
      if (now < targetEpochMs) return;
      // Past the reopen instant: refetch, then retry up to a few times ~4s apart (skew safety).
      // If the area truly opens the caller re-renders with a null target and this effect is torn
      // down before the retries run out.
      if (now - lastFireAt < 4000) return;
      lastFireAt = now;
      onReopenRef.current();
      fires += 1;
      if (fires >= 4) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [targetEpochMs]);
}

/**
 * The mirror of `useReopenAutoRefresh` for the CLOSE boundary: fires `onClose` the moment the
 * current open window's close instant passes, so the caller refetches and the feed flips
 * open→closed on its own — which is what makes the "Opens in …" countdown start automatically
 * right after closing (otherwise the cached `isOpen: true` sticks and no reopen time is shown).
 *
 * Efficient by design: a recursive setTimeout that sleeps ~30s while the close is far off and
 * tightens to 1s only in the final minute — so it costs almost nothing during normal open hours
 * (no all-day per-second timer) yet still fires promptly at the boundary. It does NO setState, so
 * it never re-renders the caller; the refetch it triggers does the update. A short burst of
 * retries absorbs device/server clock skew, then the flip nulls the target and tears this down.
 */
export function useCloseAutoRefresh(
  closesAtEpochMs: number | null | undefined,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (typeof closesAtEpochMs !== "number") return;

    let timer: ReturnType<typeof setTimeout>;
    let fires = 0;
    const tick = () => {
      const remaining = closesAtEpochMs - Date.now();
      if (remaining > 0) {
        // Far off → coarse 30s checks; final minute → 1s so we catch the boundary tightly.
        timer = setTimeout(tick, remaining > 60_000 ? 30_000 : 1_000);
        return;
      }
      // Past close: refetch, then retry a few times ~4s apart (skew safety). Once the area truly
      // flips closed the caller re-renders with a null target and this effect is torn down.
      onCloseRef.current();
      fires += 1;
      if (fires < 4) timer = setTimeout(tick, 4_000);
    };
    tick();

    return () => clearTimeout(timer);
  }, [closesAtEpochMs]);
}

/**
 * false until the absolute instant `epoch` passes, then true — with a SINGLE re-render at the
 * boundary (no per-second ticking). Lets a screen flip a restaurant to "closed" the moment its
 * service window's close instant arrives (disabling add-to-cart) WITHOUT a refetch. Adaptive timer:
 * coarse ~30s checks while far off, tightening to land exactly on the boundary. `active` (screen
 * focused) stops it while hidden; on refocus it re-checks. Absolute epoch → correct across caching.
 */
export function useHasPassed(
  epoch: number | null | undefined,
  active = true,
): boolean {
  const [passed, setPassed] = useState(
    () => typeof epoch === "number" && Date.now() >= epoch,
  );

  useEffect(() => {
    if (typeof epoch !== "number") {
      setPassed(false);
      return;
    }
    if (Date.now() >= epoch) {
      setPassed(true);
      return;
    }
    setPassed(false);
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const remaining = epoch - Date.now();
      if (remaining <= 0) {
        setPassed(true);
        return;
      }
      timer = setTimeout(tick, Math.min(30_000, remaining));
    };
    tick();
    return () => clearTimeout(timer);
  }, [epoch, active]);

  return passed;
}

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

const CLOSING_SOON_WINDOW_MS = 30 * 60 * 1000; // show the "Closing in …" countdown only in the last 30 min

/** Ms until close if we're inside the last `windowMs`; null otherwise (nothing to show). */
function closingRemaining(
  closesAtEpochMs: number | null | undefined,
  windowMs: number,
): number | null {
  if (typeof closesAtEpochMs !== "number") return null;
  const ms = closesAtEpochMs - Date.now();
  return ms > 0 && ms <= windowMs ? ms : null;
}

/**
 * Ms remaining until the current OPEN window closes — but ONLY once we're inside the last
 * `windowMs` (30 min); null otherwise. Performance: it ticks every SECOND only inside that window;
 * while the close is still further away it just re-checks every 30s (a null→null no-op re-render),
 * so an open period that's hours from closing costs almost nothing — no per-second work, and no
 * single long timer (which RN throttles/GCs). Absolute epoch (`closesAtEpochMs`) → correct across
 * response caching + timezone.
 *
 * `active` only gates the per-second TICKING (screen focused + app active). When it goes false we
 * FREEZE at the current value rather than blanking to null — blanking on focus-loss made the banner
 * vanish and the cards jump up the instant a card was tapped (mid-navigation the home is still
 * visible). Frozen → the banner holds its place; on refocus it resumes ticking.
 */
export function useClosingSoonMs(
  closesAtEpochMs: number | null | undefined,
  active = true,
  windowMs = CLOSING_SOON_WINDOW_MS,
): number | null {
  const [remaining, setRemaining] = useState<number | null>(() =>
    closingRemaining(closesAtEpochMs, windowMs),
  );

  useEffect(() => {
    // Recompute once now — correct on mount, and freezes at the right value when we go inactive.
    setRemaining(closingRemaining(closesAtEpochMs, windowMs));
    if (typeof closesAtEpochMs !== "number" || !active) return;

    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const value = closingRemaining(closesAtEpochMs, windowMs);
      setRemaining(value);
      // Inside the window → tick every second; outside → a cheap 30s re-check to catch entering it.
      timer = setTimeout(tick, value != null ? 1000 : 30000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [closesAtEpochMs, active, windowMs]);

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
