import * as Location from "expo-location";
import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  useRiderLiveTrackingPolicyQuery,
  useRiderOrdersQuery,
} from "@/src/hooks/use-rider-api";
import {
  buildActiveTrackingConfig,
  normalizeRiderLiveTrackingPolicy,
} from "@/src/lib/live-tracking-policy";
import {
  setRiderBackgroundTrackingOrderId,
  startRiderBackgroundLocationAsync,
  stopRiderBackgroundLocationAsync,
} from "@/src/lib/rider-background-location";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { clearRiderLiveFix } from "@/src/store/rider-live-location";

// ─────────────────────────────────────────────────────────────────────────────
// LOCATION TRACKING — single owner of the rider's live-location lifecycle.
//
// During an active (picked-up) delivery we run ONE expo foreground-service, started
// while the app is foreground and kept running so tracking survives the app being
// backgrounded / locked / closed. Its task (rider-background-location.ts) is the single
// producer: it feeds the map marker (shared store), publishes to the server at the admin
// cadence, and queues+flushes fixes across offline/slow gaps.
//
// The slowness after pickup was a REGRESSION, not the service itself: the tracking
// accuracy had been pushed from Balanced up to High, which makes the OS stream GPS fixes
// almost continuously and freezes the JS thread. buildActiveTrackingConfig now uses
// Balanced again (see accuracyForMode), so this is back to the light, fast behaviour.
// ─────────────────────────────────────────────────────────────────────────────
const NOTIFICATION_BODY = "Foodbela is sharing your live delivery location.";

export function RiderLocationBridge({ children }: PropsWithChildren) {
  const riderId = useRiderAuthStore((state) => state.rider?.id ?? "");
  const isAvailable = useRiderAuthStore(
    (state) => state.rider?.isAvailableForAssignments !== false,
  );
  const activeOrdersQuery = useRiderOrdersQuery("active");
  const pickedUpOrderId =
    activeOrdersQuery.data?.find((order) => order.status === "PickedUp")?.id ?? null;
  const hasActiveDelivery = Boolean(pickedUpOrderId);

  const trackingPolicyQuery = useRiderLiveTrackingPolicyQuery();
  const trackingConfig = useMemo(
    () =>
      buildActiveTrackingConfig(
        normalizeRiderLiveTrackingPolicy(trackingPolicyQuery.data),
      ),
    [trackingPolicyQuery.data],
  );
  const trackingConfigSignature = useMemo(
    () =>
      [
        trackingConfig.accuracy,
        trackingConfig.distanceIntervalMeters,
        trackingConfig.heartbeatMs,
        trackingConfig.timeIntervalMs,
      ].join(":"),
    [trackingConfig],
  );

  // Plain boolean gate — the start/stop effect re-runs ONLY when this flips, never on
  // every render or query refetch.
  const shouldTrack = Boolean(riderId) && isAvailable && hasActiveDelivery;

  // Live values for the AppState re-arm, kept in refs so the listener subscribes once.
  const shouldTrackRef = useRef(shouldTrack);
  shouldTrackRef.current = shouldTrack;
  const configRef = useRef(trackingConfig);
  configRef.current = trackingConfig;
  const orderIdRef = useRef(pickedUpOrderId);
  orderIdRef.current = pickedUpOrderId;

  const [permissionReady, setPermissionReady] = useState(false);
  useEffect(() => {
    if (!shouldTrack) {
      setPermissionReady(false);
      return;
    }
    let active = true;
    void (async () => {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.status === "granted") {
        await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
      }
      if (active) setPermissionReady(foreground.status === "granted");
    })();
    return () => {
      active = false;
    };
  }, [shouldTrack]);

  useEffect(() => {
    if (!shouldTrack || !permissionReady) {
      void setRiderBackgroundTrackingOrderId(null);
      void stopRiderBackgroundLocationAsync();
      clearRiderLiveFix();
      return;
    }

    void setRiderBackgroundTrackingOrderId(orderIdRef.current);
    void startRiderBackgroundLocationAsync({
      ...configRef.current,
      notificationBody: NOTIFICATION_BODY,
    });
    // No stop in cleanup: the effect only re-runs when shouldTrack/permission flips, and
    // the false branch above performs the stop. startRiderBackgroundLocationAsync is
    // idempotent, so a re-run with the same config never restarts the stream.
  }, [shouldTrack, permissionReady, trackingConfigSignature]);

  // An OEM can kill the foreground service while backgrounded; on return to foreground we
  // re-ensure it's running (idempotent — a no-op if it already is).
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state !== "active" || !shouldTrackRef.current) return;
      void setRiderBackgroundTrackingOrderId(orderIdRef.current);
      void startRiderBackgroundLocationAsync({
        ...configRef.current,
        notificationBody: NOTIFICATION_BODY,
      });
    };
    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, []);

  return <>{children}</>;
}
