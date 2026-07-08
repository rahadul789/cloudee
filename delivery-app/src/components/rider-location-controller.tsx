import * as Location from "expo-location";
import { PropsWithChildren, useEffect, useRef, useState } from "react";

import {
  useRiderLiveTrackingPolicyQuery,
  useRiderOrdersQuery,
  useUpdateRiderProfileLocationMutation,
} from "@/src/hooks/use-rider-api";
import {
  accuracyForMode,
  normalizeRiderLiveTrackingPolicy,
} from "@/src/lib/live-tracking-policy";
import { useRiderAuthStore } from "@/src/store/auth-store";

// ─────────────────────────────────────────────────────────────────────────────
// LIVE TRACKING — clean rebuild.
//
// STEP 2 (foreground): a SINGLE foreground GPS watch runs only while the app is open and
// the rider has an active (picked-up) delivery. Its only job is to PUBLISH the rider's
// location to the server, throttled to the admin settings (Tracking mode / Active
// delivery interval / Move threshold / Online heartbeat), single-flighted, fire-and-
// forget, with a 429 backoff. It reads the settings ONCE (no manual refetch — that was
// the rate-limit storm) and touches NO store / query cache beyond the send mutation, so
// it can't cause the re-render heaviness. The rider's own marker is the native map dot.
//
// STEP 3 will add a foreground-service so this keeps working when the app is backgrounded.
// ─────────────────────────────────────────────────────────────────────────────

function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function RiderLocationController({ children }: PropsWithChildren) {
  const riderId = useRiderAuthStore((state) => state.rider?.id ?? "");
  const isAvailable = useRiderAuthStore(
    (state) => state.rider?.isAvailableForAssignments !== false,
  );
  const activeOrdersQuery = useRiderOrdersQuery("active");
  const hasActiveDelivery = Boolean(
    activeOrdersQuery.data?.some((order) => order.status === "PickedUp"),
  );
  const shouldTrack = Boolean(riderId) && isAvailable && hasActiveDelivery;

  // Admin settings — fetched once (staleTime is long), read here. NO manual refetch.
  const policyQuery = useRiderLiveTrackingPolicyQuery();
  const policy = normalizeRiderLiveTrackingPolicy(policyQuery.data);

  // Kept in refs so the watch effect never re-subscribes on a policy/mutation identity
  // change — it only (re)starts when tracking turns on/off or permission is granted.
  const updateLocationMutation = useUpdateRiderProfileLocationMutation();
  const sendRef = useRef(updateLocationMutation.mutateAsync);
  sendRef.current = updateLocationMutation.mutateAsync;
  const configRef = useRef(policy);
  configRef.current = policy;

  // Send throttle / single-flight / backoff.
  const lastSentAtRef = useRef(0);
  const lastSentCoordRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const isSendingRef = useRef(false);
  const backoffUntilRef = useRef(0);

  const [permissionReady, setPermissionReady] = useState(false);
  useEffect(() => {
    if (!shouldTrack) {
      setPermissionReady(false);
      return;
    }
    let active = true;
    void Location.requestForegroundPermissionsAsync().then((permission) => {
      if (active) setPermissionReady(permission.status === "granted");
    });
    return () => {
      active = false;
    };
  }, [shouldTrack]);

  useEffect(() => {
    if (!shouldTrack || !permissionReady) return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const maybeSend = (position: Location.LocationObject) => {
      const now = Date.now();
      const coord = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const cfg = configRef.current;
      const minIntervalMs = cfg.updateIntervalSeconds * 1000; // Active delivery interval
      const heartbeatMs = cfg.passiveHeartbeatSeconds * 1000; // Online heartbeat
      const moveThresholdM = cfg.distanceIntervalMeters; // Move threshold
      const last = lastSentCoordRef.current;
      const elapsed = now - lastSentAtRef.current;
      const moved = last ? distanceMeters(last, coord) : Infinity;

      if (isSendingRef.current || now < backoffUntilRef.current) return;
      // Send on: first fix, OR (min interval passed AND (moved enough OR heartbeat due)).
      const shouldSend =
        !last ||
        (elapsed >= minIntervalMs && (moved >= moveThresholdM || elapsed >= heartbeatMs));
      if (!shouldSend) return;

      isSendingRef.current = true;
      lastSentAtRef.current = now;
      void sendRef
        .current({
          latitude: coord.latitude,
          longitude: coord.longitude,
          heading:
            typeof position.coords.heading === "number" && position.coords.heading >= 0
              ? position.coords.heading
              : undefined,
          accuracyMeters:
            typeof position.coords.accuracy === "number"
              ? position.coords.accuracy
              : undefined,
          speedKmph:
            typeof position.coords.speed === "number" && position.coords.speed > 0
              ? position.coords.speed * 3.6
              : undefined,
        })
        .then(() => {
          lastSentCoordRef.current = coord;
          backoffUntilRef.current = 0;
        })
        .catch((error: unknown) => {
          const status =
            typeof error === "object" && error !== null && "status" in error
              ? Number((error as { status?: unknown }).status)
              : 0;
          if (status === 429) backoffUntilRef.current = Date.now() + 60_000;
        })
        .finally(() => {
          isSendingRef.current = false;
        });
    };

    const start = async () => {
      const sub = await Location.watchPositionAsync(
        {
          accuracy: accuracyForMode(configRef.current.mode),
          timeInterval: 5000,
          distanceInterval: 15,
        },
        maybeSend,
      );
      if (cancelled) {
        sub.remove();
        return;
      }
      subscription = sub;
    };

    void start();

    return () => {
      cancelled = true;
      subscription?.remove();
      lastSentAtRef.current = 0;
      lastSentCoordRef.current = null;
      isSendingRef.current = false;
      backoffUntilRef.current = 0;
    };
  }, [shouldTrack, permissionReady]);

  return <>{children}</>;
}
