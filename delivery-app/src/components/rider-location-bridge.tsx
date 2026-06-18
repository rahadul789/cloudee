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
      void setRiderBackgroundTrackingOrderId(pickedUpOrderId);
      void startRiderBackgroundLocationAsync({
        timeIntervalMs: trackingPolicy.updateIntervalSeconds * 1000,
        distanceIntervalMeters: trackingPolicy.distanceIntervalMeters,
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
          accuracy: Location.Accuracy.Balanced,
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
  ]);

  return children;
}
