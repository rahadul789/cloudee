import * as Location from "expo-location";
import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useRiderLiveTrackingPolicyQuery, useRiderOrdersQuery } from "@/src/hooks/use-rider-api";
import { buildActiveTrackingConfig, normalizeRiderLiveTrackingPolicy } from "@/src/lib/live-tracking-policy";
import {
  getRiderBackgroundTrackingOrderId,
  isRiderNativeLocationStalled,
  publishRiderLocationAsync,
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
  const riderId = useRiderAuthStore((state) => state.rider?.id ?? "");
  const isHydrated = useRiderAuthStore((state) => state.isHydrated);
  const orders = useRiderOrdersQuery("active");
  const policy = useRiderLiveTrackingPolicyQuery();
  const config = buildActiveTrackingConfig(normalizeRiderLiveTrackingPolicy(policy.data));
  const signature = `${config.accuracy}:${config.distanceIntervalMeters}:${config.heartbeatMs}:${config.timeIntervalMs}`;
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
  const canStop = isHydrated && storageReady && (!riderId || (ordersConfirmed && !pickedUpOrder));
  const latest = useRef({ riderId, orderId, canStop, config });
  latest.current = { riderId, orderId, canStop, config };
  const reconcileRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let mounted = true;
    let chain = Promise.resolve();
    let fallback: Location.LocationSubscription | null = null;
    let fallbackRetryAtMs = 0;
    const removeFallback = () => { fallback?.remove(); fallback = null; };
    const reconcile = () => {
      chain = chain.then(async () => {
        if (!mounted) return;
        const current = latest.current;
        if (current.canStop) {
          fallbackRetryAtMs = 0;
          removeFallback();
          await stopRiderBackgroundLocationAsync();
          if (mounted) setPersistedOrder(null);
          return;
        }
        if (!current.riderId || !current.orderId) return;
        if (AppState.currentState !== "active") {
          removeFallback();
          return;
        }
        // Check only; existing access cards own permission prompts.
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted" || !mounted) return;
        await setRiderBackgroundTrackingOrderId(current.orderId);
        if (mounted) setPersistedOrder(current.orderId);
        // A registered service can silently stop delivering fixes. Recover while
        // foreground instead of treating hasStarted=true as proof of GPS health.
        if (isRiderNativeLocationStalled()) {
          if (!(await suspendRiderNativeLocationAsync())) return;
          fallbackRetryAtMs = Date.now() + 90_000;
        }
        if (fallback && Date.now() < fallbackRetryAtMs) return;
        // Stop fallback before starting the native stream: one GPS producer.
        if (Date.now() >= fallbackRetryAtMs) {
          removeFallback();
          const started = await startRiderBackgroundLocationAsync({
            ...current.config, notificationBody: NOTIFICATION_BODY,
          });
          if (!mounted || started || AppState.currentState !== "active") return;
        }
        if (!mounted || AppState.currentState !== "active") return;
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
    }, 30_000);
    return () => {
      mounted = false;
      clearInterval(timer);
      subscription.remove();
      removeFallback();
    };
  }, []);

  useEffect(() => { reconcileRef.current(); }, [riderId, orderId, canStop, signature]);
  return <>{children}</>;
}
