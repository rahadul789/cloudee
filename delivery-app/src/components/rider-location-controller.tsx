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
  getRiderBackgroundTrackingOrderId,
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

  // On reopen (especially after the app was killed mid-delivery) the orders query briefly
  // has no data. Dropping the foreground service for that window is what showed up as
  // "reopened but tracking/notification gone". So while the query has not yet given a
  // definitive first answer, we keep tracking alive using the last order id we were
  // tracking, then reconcile the moment real data arrives.
  const [persistedTrackingOrderId, setPersistedTrackingOrderId] = useState<
    string | null
  >(null);
  useEffect(() => {
    let active = true;
    getRiderBackgroundTrackingOrderId()
      .then((id) => {
        if (active) setPersistedTrackingOrderId(id);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // isPending is true ONLY on the very first load with no data (not on later refetches),
  // so this sticky window closes as soon as the query resolves once.
  const ordersResolved = !activeOrdersQuery.isPending;
  const activeTrackingOrderId =
    pickedUpOrderId ?? (!ordersResolved ? persistedTrackingOrderId : null);
  const hasActiveDelivery = Boolean(activeTrackingOrderId);
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
  const orderIdRef = useRef(activeTrackingOrderId);
  orderIdRef.current = activeTrackingOrderId;

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
      setRiderBackgroundTrackingOrderId(null).catch(() => undefined);
      stopRiderBackgroundLocationAsync().catch(() => undefined);
      return;
    }
    setRiderBackgroundTrackingOrderId(orderIdRef.current).catch(() => undefined);
    startRiderBackgroundLocationAsync({
      ...configRef.current,
      notificationBody: NOTIFICATION_BODY,
    }).catch(() => undefined);
  }, [shouldTrack, permissionReady, configSignature]);

  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state !== "active" || !shouldTrackRef.current) return;
      setRiderBackgroundTrackingOrderId(orderIdRef.current).catch(() => undefined);
      startRiderBackgroundLocationAsync({
        ...configRef.current,
        notificationBody: NOTIFICATION_BODY,
      }).catch(() => undefined);
    };
    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, []);

  return <>{children}</>;
}
