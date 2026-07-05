import * as Location from "expo-location";
import { PropsWithChildren, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  useRiderLiveTrackingPolicyQuery,
  useRiderOrdersQuery,
  useUpdateRiderProfileLocationMutation,
} from "@/src/hooks/use-rider-api";
import {
  accuracyForMode,
  buildActiveTrackingConfig,
  normalizeRiderLiveTrackingPolicy,
} from "@/src/lib/live-tracking-policy";
import { shouldAcceptFix, type AcceptedFix } from "@/src/lib/location-quality";
import {
  setRiderBackgroundTrackingOrderId,
  startRiderBackgroundLocationAsync,
  stopRiderBackgroundLocationAsync,
} from "@/src/lib/rider-background-location";
import { useRiderAuthStore } from "@/src/store/auth-store";

// Single owner of the rider's live-location lifecycle for the whole app (mounted in
// app-providers): starts/stops the background foreground-service stream based on
// whether the rider has an active delivery. No other screen should start/stop it.
export function RiderLocationBridge({ children }: PropsWithChildren) {
  const rider = useRiderAuthStore((state) => state.rider);
  const activeOrdersQuery = useRiderOrdersQuery("active");
  const trackingPolicyQuery = useRiderLiveTrackingPolicyQuery();
  const trackingPolicy = normalizeRiderLiveTrackingPolicy(trackingPolicyQuery.data);
  const updateLocationMutation = useUpdateRiderProfileLocationMutation();
  const mutateProfileLocation = updateLocationMutation.mutate;
  const pickedUpOrderId =
    activeOrdersQuery.data?.find((order) => order.status === "PickedUp")?.id ?? null;
  const hasPickedUpOrder = Boolean(
    activeOrdersQuery.data?.some((order) => order.status === "PickedUp"),
  );
  const isLocationMutationPendingRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const lastAcceptedFixRef = useRef<AcceptedFix | null>(null);
  const consecutiveRejectsRef = useRef(0);

  useEffect(() => {
    isLocationMutationPendingRef.current = updateLocationMutation.isPending;
  }, [updateLocationMutation.isPending]);

  useEffect(() => {
    if (!rider?.id || rider.isAvailableForAssignments === false) {
      void stopRiderBackgroundLocationAsync();
      return;
    }

    if (hasPickedUpOrder) {
      // Active delivery → keep the background foreground-service stream running with
      // the admin-configured, GPS-grade config. Idempotent: unchanged config won't
      // restart it, so it survives order-to-order handoffs.
      void setRiderBackgroundTrackingOrderId(pickedUpOrderId);
      void startRiderBackgroundLocationAsync({
        ...buildActiveTrackingConfig(trackingPolicy),
        notificationBody: "Foodbela is sharing your live delivery location.",
      });
      return;
    }

    void setRiderBackgroundTrackingOrderId(null);

    let subscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    const start = async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: accuracyForMode(trackingPolicy.mode),
          timeInterval: trackingPolicy.passiveHeartbeatSeconds * 1000,
          distanceInterval: Math.max(80, trackingPolicy.distanceIntervalMeters),
        },
        (position) => {
          if (!isMounted || isLocationMutationPendingRef.current) {
            return;
          }

          const now = Date.now();

          // Drop implausible fixes (bad accuracy / teleport) so a stationary drift
          // never gets published as the rider's position.
          const accepted = shouldAcceptFix({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters:
              typeof position.coords.accuracy === "number"
                ? position.coords.accuracy
                : undefined,
            nowMs: now,
            last: lastAcceptedFixRef.current,
            consecutiveRejects: consecutiveRejectsRef.current,
          });
          if (!accepted) {
            consecutiveRejectsRef.current += 1;
            return;
          }
          consecutiveRejectsRef.current = 0;
          lastAcceptedFixRef.current = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            atMs: now,
          };

          if (now - lastSentAtRef.current < trackingPolicy.passiveHeartbeatSeconds * 1000) {
            return;
          }

          lastSentAtRef.current = now;
          mutateProfileLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heading: typeof position.coords.heading === "number" ? position.coords.heading : undefined,
            accuracyMeters:
              typeof position.coords.accuracy === "number" ? position.coords.accuracy : undefined,
            speedKmph:
              typeof position.coords.speed === "number" && position.coords.speed > 0
                ? position.coords.speed * 3.6
                : undefined,
          });
        }
      );
    };

    void start();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [
    rider?.id,
    rider?.isAvailableForAssignments,
    hasPickedUpOrder,
    pickedUpOrderId,
    mutateProfileLocation,
    trackingPolicy.distanceIntervalMeters,
    trackingPolicy.passiveHeartbeatSeconds,
    trackingPolicy.updateIntervalSeconds,
    trackingPolicy.mode,
  ]);

  // Live snapshot for the AppState re-arm below (kept in refs so the listener stays
  // subscribed once and always reads current values).
  const shouldTrackRef = useRef(false);
  const activeConfigRef = useRef(buildActiveTrackingConfig(trackingPolicy));
  const pickedUpOrderIdRef = useRef(pickedUpOrderId);
  shouldTrackRef.current = Boolean(
    rider?.id && rider.isAvailableForAssignments !== false && hasPickedUpOrder,
  );
  activeConfigRef.current = buildActiveTrackingConfig(trackingPolicy);
  pickedUpOrderIdRef.current = pickedUpOrderId;

  // Re-arm the foreground-service stream when the app returns to the foreground.
  // Android can't start it while backgrounded, and aggressive OEMs may have killed
  // it — so on resume we ensure it's running again (idempotent if it already is).
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state !== "active" || !shouldTrackRef.current) return;
      void setRiderBackgroundTrackingOrderId(pickedUpOrderIdRef.current);
      void startRiderBackgroundLocationAsync({
        ...activeConfigRef.current,
        notificationBody: "Foodbela is sharing your live delivery location.",
      });
    };
    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, []);

  return children;
}
