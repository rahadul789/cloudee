import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

// Signed shortest angular distance from → to, in [-180, 180].
function shortestDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

// How hard to low-pass the raw compass (0 = frozen, 1 = no smoothing). Lower = steadier but
// a touch laggier — this is what kills the constant jitter.
const SMOOTHING = 0.18;
// Don't push a new value (re-render + re-rotate) until the smoothed heading has actually moved
// this much, so a still phone holds rock-steady instead of vibrating ±1°.
const MIN_STEP_DEG = 1;

// Live device-facing direction (compass heading), 0–360° where 0 = true north. Driven by the
// magnetometer (watchHeadingAsync) — a different sensor from GPS, so no extra location client.
// The raw signal is noisy, so we exponentially smooth it along the shortest arc and only emit
// when it moves past a deadband → a smooth, stable arrow like Google Maps rather than a
// twitchy one.
export function useDeviceHeading(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  const smoothRef = useRef<number | null>(null);
  const emittedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setHeading(null);
      smoothRef.current = null;
      emittedRef.current = null;
      return;
    }

    let cancelled = false;
    let subscription: Awaited<ReturnType<typeof Location.watchHeadingAsync>> | null = null;

    (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted" || cancelled) return;

        subscription = await Location.watchHeadingAsync((data) => {
          const raw = data.trueHeading >= 0 ? data.trueHeading : data.magHeading;
          if (typeof raw !== "number" || Number.isNaN(raw)) return;

          const prev = smoothRef.current;
          if (prev == null) {
            smoothRef.current = raw;
            emittedRef.current = raw;
            setHeading(raw);
            return;
          }

          // Exponential moving average along the shortest arc (handles the 359°→0° wrap).
          const next = (prev + shortestDelta(prev, raw) * SMOOTHING + 360) % 360;
          smoothRef.current = next;

          const emitted = emittedRef.current;
          if (emitted == null || Math.abs(shortestDelta(emitted, next)) >= MIN_STEP_DEG) {
            emittedRef.current = next;
            setHeading(next);
          }
        });

        if (cancelled) {
          subscription?.remove();
          subscription = null;
        }
      } catch {
        // No magnetometer (emulator / some devices) → no arrow, everything else still works.
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      subscription = null;
    };
  }, [enabled]);

  return heading;
}
