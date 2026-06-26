import * as Location from "expo-location";
import { PropsWithChildren, useEffect, useRef } from "react";

import {
  useRiderLiveTrackingPolicyQuery,
  useRiderOrdersQuery,
  useUpdateRiderProfileLocationMutation,
} from "@/src/hooks/use-rider-api";
import { normalizeRiderLiveTrackingPolicy } from "@/src/lib/live-tracking-policy";
import {
  setRiderBackgroundTrackingOrderId,
  startRiderBackgroundLocationAsync,
  stopRiderBackgroundLocationAsync,
} from "@/src/lib/rider-background-location";
import { useRiderAuthStore } from "@/src/store/auth-store";

// Map the admin "tracking mode" to a real GPS accuracy level so "High accuracy" and
// "Battery saver" actually change the sensor, not just the update cadence.
function accuracyForMode(mode: string | undefined) {
  if (mode === "high_accuracy") return Location.Accuracy.High;
  if (mode === "battery_saver") return Location.Accuracy.Low;
  return Location.Accuracy.Balanced;
}

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

  useEffect(() => {
    isLocationMutationPendingRef.current = updateLocationMutation.isPending;
  }, [updateLocationMutation.isPending]);

  useEffect(() => {
    if (!rider?.id || rider.isAvailableForAssignments === false) {
      void stopRiderBackgroundLocationAsync();
      return;
    }

    if (hasPickedUpOrder) {
      // Active-delivery heartbeat: even if the rider is stationary, send at least
      // this often so the customer's marker/ETA never freezes in traffic.
      const heartbeatMs =
        Math.min(Math.max(trackingPolicy.updateIntervalSeconds * 2, 30), 90) * 1000;
      void setRiderBackgroundTrackingOrderId(pickedUpOrderId);
      void startRiderBackgroundLocationAsync({
        timeIntervalMs: trackingPolicy.updateIntervalSeconds * 1000,
        distanceIntervalMeters: trackingPolicy.distanceIntervalMeters,
        heartbeatMs,
        accuracy: accuracyForMode(trackingPolicy.mode),
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

  return children;
}
