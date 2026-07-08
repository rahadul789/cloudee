import * as Location from "expo-location";
import { PropsWithChildren, useEffect, useRef, useState } from "react";
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

// ─────────────────────────────────────────────────────────────────────────────
// LIVE TRACKING — single owner of the location lifecycle (foreground + background).
//
// During an active (picked-up) delivery we run ONE expo foreground-service (started
// while foreground) so tracking survives the app being backgrounded / locked / closed.
// Its task (rider-background-location.ts) is the single producer: it publishes the
// rider's position at the admin cadence, queues+flushes across offline/slow gaps, and
// does NO React/query/store work (so it can't cause re-render heaviness).
//
// CRITICAL: the maps must NOT use react-native-maps `showsUserLocation` while this runs.
// The native "my location" dot fights the background location service for the GPS — that
// is what blinked the dot and froze/crashed the app. The rider's own position is conveyed
// by the route + the external "Navigate" button instead.
// ─────────────────────────────────────────────────────────────────────────────
const NOTIFICATION_BODY = "Foodbela is sharing your live delivery location.";

export function RiderLocationController({ children }: PropsWithChildren) {
  const riderId = useRiderAuthStore((state) => state.rider?.id ?? "");
  const isAvailable = useRiderAuthStore(
    (state) => state.rider?.isAvailableForAssignments !== false,
  );
  const activeOrdersQuery = useRiderOrdersQuery("active");
  const pickedUpOrderId =
    activeOrdersQuery.data?.find((order) => order.status === "PickedUp")?.id ?? null;
  const hasActiveDelivery = Boolean(pickedUpOrderId);
  const shouldTrack = Boolean(riderId) && isAvailable && hasActiveDelivery;

  // Admin settings — read once (long staleTime). NO manual refetch.
  const policyQuery = useRiderLiveTrackingPolicyQuery();
  const config = buildActiveTrackingConfig(
    normalizeRiderLiveTrackingPolicy(policyQuery.data),
  );
  const configSignature = `${config.accuracy}:${config.distanceIntervalMeters}:${config.heartbeatMs}:${config.timeIntervalMs}`;

  const shouldTrackRef = useRef(shouldTrack);
  shouldTrackRef.current = shouldTrack;
  const configRef = useRef(config);
  configRef.current = config;
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
      return;
    }
    void setRiderBackgroundTrackingOrderId(orderIdRef.current);
    void startRiderBackgroundLocationAsync({
      ...configRef.current,
      notificationBody: NOTIFICATION_BODY,
    });
  }, [shouldTrack, permissionReady, configSignature]);

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
