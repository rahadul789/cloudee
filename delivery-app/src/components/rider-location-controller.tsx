import * as Location from "expo-location";
import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useRiderLiveTrackingPolicyQuery, useRiderOrdersQuery } from "@/src/hooks/use-rider-api";
import { buildActiveTrackingConfig, normalizeRiderLiveTrackingPolicy } from "@/src/lib/live-tracking-policy";
import {
  getRiderBackgroundTrackingOrderId,
  isRiderNativeLocationStalled,
  isRiderPickupPreparing,
  publishRiderLocationAsync,
  refreshRiderLocationAsync,
  setRiderBackgroundTrackingOrderId,
  startRiderBackgroundLocationAsync,
  stopRiderBackgroundLocationAsync,
  suspendRiderNativeLocationAsync,
} from "@/src/lib/rider-background-location";
import { useRiderAuthStore } from "@/src/store/auth-store";

const NOTIFICATION_BODY = "Foodbela is sharing your live delivery location.";

// Never stop the native stream merely because hydration or a request is pending.
// Serialize starts/stops so app resumes cannot race delivery completion.
export function RiderLocationController({ children }: PropsWithChildren) {
  const rider = useRiderAuthStore((state) => state.rider);
  const riderId = rider?.id ?? "";
  const available = rider?.isAvailableForAssignments !== false;
  const isHydrated = useRiderAuthStore((state) => state.isHydrated);
  const orders = useRiderOrdersQuery("active");
  const policy = useRiderLiveTrackingPolicyQuery();
  const normalized = normalizeRiderLiveTrackingPolicy(policy.data);
  const [persistedOrder, setPersistedOrder] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void getRiderBackgroundTrackingOrderId().then((id) => {
      if (mounted) {
        setPersistedOrder(id);
        setStorageReady(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  const pickedUpOrder = orders.data?.find((order) => order.status === "PickedUp")?.id;
  const ordersConfirmed = orders.isSuccess && orders.isFetchedAfterMount;
  // A failed request is not proof that a delivery ended.
  const orderId = pickedUpOrder ?? (ordersConfirmed ? null : persistedOrder);
  const canStop = isHydrated && storageReady && (!riderId || (!available && ordersConfirmed && !pickedUpOrder));
  // Available riders also publish before pickup so dispatch can find the nearest rider.
  const config = orderId ? buildActiveTrackingConfig(normalized) : {
    ...buildActiveTrackingConfig(normalized), accuracy: Location.Accuracy.Balanced,
    timeIntervalMs: 30_000, heartbeatMs: 45_000,
  };
  const signature = `${config.accuracy}:${config.distanceIntervalMeters}:${config.heartbeatMs}:${config.timeIntervalMs}`;
  const latest = useRef({ riderId, orderId, canStop, config });
  latest.current = { riderId, orderId, canStop, config };
  const reconcileRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let mounted = true;
    let chain = Promise.resolve();
    let fallback: Location.LocationSubscription | null = null;
    let fallbackSignature = "";
    let lastOrderId: string | null | undefined;
    const removeFallback = () => { fallback?.remove(); fallback = null; fallbackSignature = ""; };
    const reconcile = () => {
      chain = chain.then(async () => {
        if (!mounted) return;
        const current = latest.current;
        if (current.canStop) {
          if (current.riderId && isRiderPickupPreparing()) return;
          removeFallback();
          await stopRiderBackgroundLocationAsync();
          if (mounted) setPersistedOrder(null);
          return;
        }
        if (!current.riderId || !isHydrated || !storageReady) return;
        if (AppState.currentState !== "active") {
          removeFallback();
          return;
        }
        // Check only; existing access cards own permission prompts.
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted" || !mounted) return;
        const changedOrder = current.orderId !== lastOrderId;
        lastOrderId = current.orderId;
        // A real fresh fix on startup/pickup/resume; no timestamp-only heartbeat.
        void refreshRiderLocationAsync({ accuracy: current.config.accuracy, force: changedOrder }).catch(() => undefined);
        await setRiderBackgroundTrackingOrderId(current.orderId);
        if (mounted) setPersistedOrder(current.orderId);
        // A registered service can silently stop delivering fixes. Recover while
        // foreground instead of treating hasStarted=true as proof of GPS health.
        if (isRiderNativeLocationStalled()) {
          if (!(await suspendRiderNativeLocationAsync())) return;
          // Restart the native service immediately while foreground. Leaving it
          // stopped for 90s lost background tracking if the rider locked the phone.
        }
        // Keep an existing fallback alive during native retries. Recreating it on
        // every watchdog tick can cancel GPS acquisition before the first fix.
        const started = await startRiderBackgroundLocationAsync({
          ...current.config, notificationBody: NOTIFICATION_BODY,
        });
        if (!mounted || AppState.currentState !== "active") { removeFallback(); return; }
        if (started) { removeFallback(); return; }
        const nextFallbackSignature = JSON.stringify(current.config);
        if (fallback && fallbackSignature === nextFallbackSignature) return;
        removeFallback();
        fallbackSignature = nextFallbackSignature;
        fallback = await Location.watchPositionAsync({
          accuracy: current.config.accuracy,
          timeInterval: current.config.timeIntervalMs,
          distanceInterval: 0,
        }, (location) => {
          void publishRiderLocationAsync(location).catch(() => {
            console.warn("[rider-tracking] Foreground location processing failed");
          });
        });
        if (!mounted || AppState.currentState !== "active") removeFallback();
      }).catch(() => {
        console.warn("[rider-tracking] Location lifecycle failed; retrying while active");
      });
    };
    reconcileRef.current = reconcile;
    reconcile();
    const subscription = AppState.addEventListener("change", reconcile);
    const timer = setInterval(() => {
      if (AppState.currentState === "active") reconcile();
    }, 15_000);
    return () => {
      mounted = false;
      clearInterval(timer);
      subscription.remove();
      removeFallback();
    };
  }, [isHydrated, storageReady]);

  useEffect(() => { reconcileRef.current(); }, [riderId, orderId, canStop, signature]);
  return <>{children}</>;
}
