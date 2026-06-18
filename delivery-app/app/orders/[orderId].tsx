import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useAcceptOrderMutation,
  useActivateTrackingMutation,
  useDeliverOrderMutation,
  useRiderDeliveryThresholdsQuery,
  useRiderMapStyleQuery,
  usePickupOrderMutation,
  useRiderLiveTrackingPolicyQuery,
  useRiderOrderDetailsQuery,
  useRiderSupportContactQuery,
  useUpdateRiderProfileLocationMutation,
} from "@/src/hooks/use-rider-api";
import { useNetworkStatus } from "@/src/hooks/use-network-status";
import { isBangla, useDeliveryCopy } from "@/src/lib/copy";
import { formatDateTime, formatRelativeTime } from "@/src/lib/date-time";
import { normalizeRiderLiveTrackingPolicy } from "@/src/lib/live-tracking-policy";
import { getOrderStatusBadge, getPaymentMethodBadge } from "@/src/lib/rider-order-display";
import {
  startRiderBackgroundLocationAsync,
  stopRiderBackgroundLocationAsync,
} from "@/src/lib/rider-background-location";
import {
  openRiderLocationSettings,
  requestRiderForegroundPermission,
  getRiderLocationPayload,
  type RiderLocationPayload,
} from "@/src/lib/rider-location-permissions";
import {
  RiderLiveMap,
  type RiderLiveMapHandle,
} from "@/src/components/orders/rider-live-map";
import { PersistentBottomSheet } from "@/src/components/persistent-bottom-sheet";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

type Coordinate = { latitude: number; longitude: number };
type LiveRider = { latitude: number; longitude: number; heading: number | null };

const HOLD_DURATION_MS = 900;
const UI_POSITION_THROTTLE_MS = 1600;
const DEFAULT_DELIVERY_THRESHOLDS = {
  deliveryWatchAfterPickupMinutes: 20,
  deliveryLateAfterPickupMinutes: 25,
  deliveryCriticalAfterPickupMinutes: 30,
  riderEtaSpeedKmph: 24,
  riderEtaRouteFactor: 1.1,
};
const PICKUP_LOCATION_TIMEOUT_MS = 5500;
const PICKUP_LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 1000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(pointA: Coordinate, pointB: Coordinate) {
  const earthRadius = 6371;
  const deltaLat = toRadians(pointB.latitude - pointA.latitude);
  const deltaLng = toRadians(pointB.longitude - pointA.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(pointA.latitude)) *
      Math.cos(toRadians(pointB.latitude)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function estimateCycleEtaMinutes(distanceKm: number, speedKmph = 24, routeFactor = 1.1) {
  if (distanceKm <= 0) return 0;
  const safeSpeed = Math.min(45, Math.max(6, speedKmph));
  const safeRouteFactor = Math.min(2, Math.max(1, routeFactor));
  return Math.max(1, Math.round(((distanceKm * safeRouteFactor) / safeSpeed) * 60));
}

function formatDistanceLabel(distanceKm?: number | null) {
  if (typeof distanceKm !== "number" || Number.isNaN(distanceKm)) return "--";
  if (distanceKm < 1) return `${Math.max(1, Math.round(distanceKm * 1000))} m`;
  return `${distanceKm.toFixed(2)} km`;
}

function formatEtaLabel(minutes?: number | null) {
  if (typeof minutes !== "number" || Number.isNaN(minutes)) return "--";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatMoney(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return `Tk ${Math.round(value).toLocaleString()}`;
}

function formatPaymentMethod(value?: string | null) {
  const normalized = `${value ?? ""}`.trim().toLowerCase();
  if (!normalized) return "--";
  if (normalized.includes("bkash")) return "bKash";
  if (normalized.includes("cash")) return "Cash on delivery";
  return `${value}`.trim();
}

function getElapsedMinutes(value?: string | null, nowMs = Date.now()) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((nowMs - timestamp) / 60000));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("LOCATION_TIMEOUT")), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function getPickupLocationPayload() {
  const lastKnownPosition = await Location.getLastKnownPositionAsync({
    maxAge: PICKUP_LAST_KNOWN_MAX_AGE_MS,
  }).catch(() => null);

  if (lastKnownPosition) {
    return getRiderLocationPayload(lastKnownPosition);
  }

  const currentPosition = await withTimeout(
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }),
    PICKUP_LOCATION_TIMEOUT_MS,
  );

  return getRiderLocationPayload(currentPosition);
}

type HoldToConfirmButtonProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  loading: boolean;
  disabled: boolean;
  tone?: "pickup" | "deliver";
  onConfirm: () => void;
  onHoldingChange?: (holding: boolean) => void;
};

const HoldToConfirmButton = memo(function HoldToConfirmButton({
  label,
  icon,
  loading,
  disabled,
  tone = "pickup",
  onConfirm,
  onHoldingChange,
}: HoldToConfirmButtonProps) {
  const [progress, setProgress] = useState(0);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartedAtRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);
  const hasConfirmedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const finishHold = useCallback(
    (complete: boolean) => {
      clearTimers();
      holdStartedAtRef.current = null;

      if (isHoldingRef.current) {
        isHoldingRef.current = false;
        onHoldingChange?.(false);
      }

      if (complete) {
        setProgress(1);
        hasConfirmedRef.current = true;
        onConfirm();
        return;
      }

      hasConfirmedRef.current = false;
      setProgress(0);
    },
    [clearTimers, onConfirm, onHoldingChange],
  );

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!disabled && !loading) return;
    clearTimers();
    holdStartedAtRef.current = null;
    hasConfirmedRef.current = false;
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      onHoldingChange?.(false);
    }
    setProgress(0);
  }, [clearTimers, disabled, loading, onHoldingChange]);

  const handlePressIn = useCallback(() => {
    if (disabled || loading || isHoldingRef.current) return;

    isHoldingRef.current = true;
    hasConfirmedRef.current = false;
    onHoldingChange?.(true);
    setProgress(0);
    holdStartedAtRef.current = Date.now();

    holdIntervalRef.current = setInterval(() => {
      if (!holdStartedAtRef.current) return;
      const nextProgress = Math.min(1, (Date.now() - holdStartedAtRef.current) / HOLD_DURATION_MS);
      setProgress(nextProgress);
    }, 16);
  }, [disabled, loading, onHoldingChange]);

  const handleLongPress = useCallback(() => {
    if (!isHoldingRef.current || hasConfirmedRef.current || disabled || loading) return;
    finishHold(true);
  }, [disabled, finishHold, loading]);

  const handlePressOut = useCallback(() => {
    if (!isHoldingRef.current) return;
    if (hasConfirmedRef.current) return;
    finishHold(false);
  }, [finishHold]);

  return (
    <Pressable
      style={[
        styles.holdButton,
        tone === "deliver" && styles.holdButtonDeliver,
        disabled && styles.buttonDisabled,
      ]}
      onPressIn={handlePressIn}
      onLongPress={handleLongPress}
      onPressOut={handlePressOut}
      delayLongPress={HOLD_DURATION_MS}
      hitSlop={6}
      pressRetentionOffset={{ top: 40, bottom: 40, left: 40, right: 40 }}
      disabled={disabled}
    >
      {progress > 0 ? (
        <View
          style={[
            styles.holdProgressFill,
            tone === "deliver" && styles.holdProgressFillDeliver,
            { width: `${progress * 100}%` },
          ]}
        />
      ) : null}
      <View style={styles.holdButtonContent}>
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name={icon} size={tone === "deliver" ? 20 : 19} color="#fff" />
        )}
        <Text style={styles.holdButtonText}>{label}</Text>
      </View>
    </Pressable>
  );
});

export default function RiderOrderDetailsScreen() {
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = params.orderId;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const rider = useRiderAuthStore((state) => state.rider);
  const accessToken = useRiderAuthStore((state) => state.accessToken);
  const { copy, language } = useDeliveryCopy();
  const isNetworkOnline = useNetworkStatus();
  const isBn = isBangla(language);

  const t = useMemo(
    () => ({
      navigate: isBn ? "নেভিগেট" : "Navigate",
      roadRoute: isBn ? "রোড রুট" : "Road route",
      liveTraffic: isBn ? "লাইভ ট্রাফিক" : "Live traffic",
      directEstimate: isBn ? "সরাসরি অনুমান" : "Direct estimate",
      details: isBn ? "অর্ডার বিস্তারিত" : "Order details",
      live: isBn ? "লাইভ" : "Live",
      syncing: isBn ? "সিঙ্ক হচ্ছে" : "Syncing",
      offline: isBn ? "অফলাইন" : "Offline",
      reconnect: isBn ? "আবার যোগাযোগ করুন" : "Reconnect to continue",
      reconnectTracking: isBn
        ? "লাইভ আপডেট আর ট্রিপ অ্যাকশন চালু রাখতে আবার যোগাযোগ করুন।"
        : "Reconnect to resume live updates and trip actions.",
      reconnectAccept: isBn
        ? "এই অর্ডার গ্রহণ করার আগে আবার যোগাযোগ করুন।"
        : "Reconnect before accepting this order.",
      reconnectDelivery: isBn
        ? "এই ট্রিপ আপডেট করার আগে আবার যোগাযোগ করুন।"
        : "Reconnect before updating this trip.",
      paused: isBn ? "পজ করা" : "Paused",
      address: isBn ? "ঠিকানা" : "Address",
      tapForDetails: isBn ? "বিস্তারিত দেখতে টানুন" : "Pull up for full details",
      minOut: isBn ? "মিনিট হয়েছে" : "min out",
    }),
    [isBn],
  );

  const [trackingError, setTrackingError] = useState("");
  const [activeHoldAction, setActiveHoldAction] = useState<"pickup" | "deliver" | null>(null);
  const [isPickupPreparing, setIsPickupPreparing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const liveMapRef = useRef<RiderLiveMapHandle | null>(null);
  const latestLiveRiderRef = useRef<LiveRider | null>(null);
  const lastUiPositionAtRef = useRef(0);
  const routeWarmupOrderRef = useRef<string | null>(null);
  const isCompletingDeliveryRef = useRef(false);

  const orderQuery = useRiderOrderDetailsQuery(orderId);
  const trackingPolicyQuery = useRiderLiveTrackingPolicyQuery();
  const orderDetailsMapStyleQuery = useRiderMapStyleQuery("delivery.order_details");
  const deliveryThresholdsQuery = useRiderDeliveryThresholdsQuery();
  const supportContactQuery = useRiderSupportContactQuery();
  const trackingPolicy = normalizeRiderLiveTrackingPolicy(trackingPolicyQuery.data);
  const acceptMutation = useAcceptOrderMutation();
  const activateTrackingMutation = useActivateTrackingMutation();
  const pickupMutation = usePickupOrderMutation();
  const deliverMutation = useDeliverOrderMutation();
  const profileLocationMutation = useUpdateRiderProfileLocationMutation();

  const order = orderQuery.data;
  const supportPhone = supportContactQuery.data?.phone;
  const isFocusedLiveTrip = Boolean(order?.isFocusedLiveTrip);
  const isAssignmentsPaused = rider?.isAvailableForAssignments === false;
  const trackingLocation = order?.riderTracking?.currentLocation;
  const lastKnownRiderLocation = rider?.lastKnownLocation;

  const restaurantCoordinate = useMemo(
    () =>
      typeof order?.restaurant?.latitude === "number" && typeof order?.restaurant?.longitude === "number"
        ? { latitude: order.restaurant.latitude, longitude: order.restaurant.longitude }
        : null,
    [order?.restaurant?.latitude, order?.restaurant?.longitude],
  );
  const customerCoordinate = useMemo(
    () =>
      typeof order?.customer?.deliveryAddress?.latitude === "number" &&
      typeof order?.customer?.deliveryAddress?.longitude === "number"
        ? {
            latitude: order.customer.deliveryAddress.latitude,
            longitude: order.customer.deliveryAddress.longitude,
          }
        : null,
    [order?.customer?.deliveryAddress?.latitude, order?.customer?.deliveryAddress?.longitude],
  );
  const serverRiderCoordinate = useMemo(
    () =>
      typeof trackingLocation?.latitude === "number" && typeof trackingLocation?.longitude === "number"
        ? { latitude: trackingLocation.latitude, longitude: trackingLocation.longitude }
        : typeof lastKnownRiderLocation?.latitude === "number" &&
            typeof lastKnownRiderLocation?.longitude === "number"
          ? { latitude: lastKnownRiderLocation.latitude, longitude: lastKnownRiderLocation.longitude }
          : null,
    [
      lastKnownRiderLocation?.latitude,
      lastKnownRiderLocation?.longitude,
      trackingLocation?.latitude,
      trackingLocation?.longitude,
    ],
  );
  const riderCoordinate = useMemo(
    () => serverRiderCoordinate,
    [serverRiderCoordinate],
  );
  const riderHeading = trackingLocation?.heading ?? lastKnownRiderLocation?.heading ?? null;

  const isPickedUp = order?.status === "PickedUp";
  const deliveryThresholds = deliveryThresholdsQuery.data ?? DEFAULT_DELIVERY_THRESHOLDS;

  useEffect(() => {
    if (!isPickedUp) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [isPickedUp]);

  const pickedUpAt = order?.timestamps?.PickedUp ?? order?.timestamps?.pickedUpAt ?? null;
  const pickedUpElapsedMinutes = isPickedUp ? getElapsedMinutes(pickedUpAt, nowMs) : null;
  const deliveryDelayState = useMemo(() => {
    if (!isPickedUp || pickedUpElapsedMinutes === null) return null;
    if (pickedUpElapsedMinutes >= deliveryThresholds.deliveryCriticalAfterPickupMinutes) {
      return {
        level: "critical" as const,
        title: "Critical delivery delay",
        message: "Admin can now follow up. Keep location on and call support if blocked.",
        icon: "alert-circle-outline" as const,
      };
    }
    if (pickedUpElapsedMinutes >= deliveryThresholds.deliveryLateAfterPickupMinutes) {
      return {
        level: "late" as const,
        title: "Delivery is running late",
        message: "Customer ETA may be affected. Move to the drop point or contact support.",
        icon: "time-outline" as const,
      };
    }
    if (pickedUpElapsedMinutes >= deliveryThresholds.deliveryWatchAfterPickupMinutes) {
      return {
        level: "watch" as const,
        title: "Delivery watch",
        message: "You are close to the delivery target. Keep the live trip moving.",
        icon: "timer-outline" as const,
      };
    }
    return null;
  }, [
    deliveryThresholds.deliveryCriticalAfterPickupMinutes,
    deliveryThresholds.deliveryLateAfterPickupMinutes,
    deliveryThresholds.deliveryWatchAfterPickupMinutes,
    isPickedUp,
    pickedUpElapsedMinutes,
  ]);
  const deliveryDelayProgress =
    pickedUpElapsedMinutes === null
      ? 0
      : clamp(pickedUpElapsedMinutes / deliveryThresholds.deliveryCriticalAfterPickupMinutes, 0, 1);

  const isAssignedPrePickup =
    order?.status === "ReadyForPickup" && order?.assignmentState === "assigned_to_you";
  const isAcceptStep = order?.status === "ReadyForPickup" && order?.assignmentState === "unassigned";
  const isPickupStep = order?.status === "ReadyForPickup" && order?.assignmentState === "assigned_to_you";
  const hasAnotherActiveLiveTrip =
    Boolean(rider?.activeTrackingOrderId) && rider?.activeTrackingOrderId !== order?.id;
  const isPreviewOnlyRoute =
    isAssignedPrePickup && !order?.isTrackingActiveForRider && hasAnotherActiveLiveTrip;
  const shouldShowCurrentApproachLeg = isPickedUp
    ? true
    : isAssignedPrePickup && !isPreviewOnlyRoute;

  const isAcceptDisabled = !isNetworkOnline || isAssignmentsPaused || acceptMutation.isPending;
  const isPickupBusy = isPickupPreparing || pickupMutation.isPending || profileLocationMutation.isPending;
  const isPickupDisabled = !isNetworkOnline || isPickupBusy;
  const isDeliverDisabled = !isNetworkOnline || deliverMutation.isPending;
  const isTrackingActivationDisabled = !isNetworkOnline || activateTrackingMutation.isPending;
  const offlineAcceptWarning =
    copy.orderDetails.warningOfflineAccept ?? "Reconnect before accepting a new order.";

  const currentLegDistanceKm = useMemo(() => {
    if (typeof order?.routeToNext?.distanceKm === "number") {
      return order.routeToNext.distanceKm;
    }
    if (isPickedUp) {
      if (typeof order?.riderTracking?.remainingDistanceKm === "number") {
        return order.riderTracking.remainingDistanceKm;
      }
      return riderCoordinate && customerCoordinate
        ? calculateDistanceKm(riderCoordinate, customerCoordinate)
        : null;
    }
    return riderCoordinate && restaurantCoordinate
      ? calculateDistanceKm(riderCoordinate, restaurantCoordinate)
      : null;
  }, [
    customerCoordinate,
    isPickedUp,
    order?.routeToNext?.distanceKm,
    order?.riderTracking?.remainingDistanceKm,
    restaurantCoordinate,
    riderCoordinate,
  ]);

  const nextLegDistanceKm = useMemo(() => {
    if (isPickedUp) return null;
    return restaurantCoordinate && customerCoordinate
      ? calculateDistanceKm(restaurantCoordinate, customerCoordinate)
      : null;
  }, [customerCoordinate, isPickedUp, restaurantCoordinate]);

  const currentLegEtaMinutes = useMemo(() => {
    if (typeof order?.routeToNext?.durationMinutes === "number") {
      return Math.max(1, Math.round(order.routeToNext.durationMinutes));
    }
    if (isPickedUp && typeof order?.riderTracking?.remainingDurationMinutes === "number") {
      return Math.max(1, Math.round(order.riderTracking.remainingDurationMinutes));
    }
    return typeof currentLegDistanceKm === "number"
      ? estimateCycleEtaMinutes(
          currentLegDistanceKm,
          deliveryThresholds.riderEtaSpeedKmph,
          deliveryThresholds.riderEtaRouteFactor,
        )
      : null;
  }, [
    currentLegDistanceKm,
    deliveryThresholds.riderEtaRouteFactor,
    deliveryThresholds.riderEtaSpeedKmph,
    isPickedUp,
    order?.routeToNext?.durationMinutes,
    order?.riderTracking?.remainingDurationMinutes,
  ]);

  const nextLegEtaMinutes = useMemo(
    () =>
      typeof nextLegDistanceKm === "number"
        ? estimateCycleEtaMinutes(
            nextLegDistanceKm,
            deliveryThresholds.riderEtaSpeedKmph,
            deliveryThresholds.riderEtaRouteFactor,
          )
        : null,
    [deliveryThresholds.riderEtaRouteFactor, deliveryThresholds.riderEtaSpeedKmph, nextLegDistanceKm],
  );

  const displayedEtaMinutes = currentLegEtaMinutes ?? nextLegEtaMinutes ?? null;
  const activeLegLabel = isPickedUp ? copy.orderDetails.toCustomer : copy.orderDetails.toRestaurant;

  const timelineRows = useMemo(() => {
    const rows = order?.history ?? [];
    return rows.filter((entry, index) => {
      if (!entry.status) return false;
      const previous = rows[index - 1];
      return previous?.status !== entry.status;
    });
  }, [order?.history]);
  const itemRows = useMemo(() => order?.items ?? [], [order?.items]);
  const shouldShowTripSyncStatus = isAssignedPrePickup || isPickedUp;

  useEffect(() => {
    if (
      !order ||
      !isAssignedPrePickup ||
      order.routeToNext?.polyline ||
      !isNetworkOnline ||
      profileLocationMutation.isPending ||
      routeWarmupOrderRef.current === order.id
    ) {
      return;
    }

    routeWarmupOrderRef.current = order.id;
    let isMounted = true;

    const warmRouteOrigin = async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") return;

      const payload = await getPickupLocationPayload();
      if (!isMounted) return;

      await profileLocationMutation.mutateAsync(payload);
      if (!isMounted) return;

      await orderQuery.refetch();
    };

    warmRouteOrigin().catch(() => {
      if (routeWarmupOrderRef.current === order.id) {
        routeWarmupOrderRef.current = null;
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    isAssignedPrePickup,
    isNetworkOnline,
    order,
    orderQuery,
    profileLocationMutation,
  ]);

  const openInNativeMaps = useCallback(() => {
    const destination = isPickedUp
      ? customerCoordinate ?? restaurantCoordinate
      : restaurantCoordinate ?? customerCoordinate;
    if (!destination) return;
    const origin = latestLiveRiderRef.current ?? riderCoordinate;
    const originSegment = origin
      ? `&origin=${origin.latitude},${origin.longitude}`
      : "";
    const url = `https://www.google.com/maps/dir/?api=1${originSegment}&destination=${destination.latitude},${destination.longitude}&travelmode=bicycling`;
    void Linking.openURL(url);
  }, [customerCoordinate, isPickedUp, restaurantCoordinate, riderCoordinate]);

  const updateLiveRider = useCallback((position: Location.LocationObject) => {
    const now = Date.now();
    if (now - lastUiPositionAtRef.current < UI_POSITION_THROTTLE_MS) return;
    lastUiPositionAtRef.current = now;
    const nextLiveRider = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      heading:
        typeof position.coords.heading === "number" && position.coords.heading >= 0
          ? position.coords.heading
          : null,
    };
    latestLiveRiderRef.current = nextLiveRider;
    liveMapRef.current?.setLiveRider(nextLiveRider);
  }, []);

  useEffect(() => {
    if (order?.status === "PickedUp") return;
    latestLiveRiderRef.current = null;
    liveMapRef.current?.clearLiveRider();
  }, [order?.status, orderId]);

  useEffect(
    () => () => {
      latestLiveRiderRef.current = null;
      liveMapRef.current?.clearLiveRider();
    },
    [],
  );

  useEffect(() => {
    if (order?.status !== "PickedUp" || !isFocusedLiveTrip || !orderId) return;

    let subscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    const startWatching = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        if (isMounted) setTrackingError(copy.orderDetails.trackingPermissionError);
        return;
      }

      try {
        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (isMounted && !isCompletingDeliveryRef.current) {
          updateLiveRider(currentPosition);
          setTrackingError("");
        }
      } catch {
        if (isMounted) setTrackingError(copy.orderDetails.trackingWaitingFirstLocation);
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: Math.max(1800, Math.min(3200, trackingPolicy.updateIntervalSeconds * 700)),
          distanceInterval: Math.max(8, Math.min(18, trackingPolicy.distanceIntervalMeters)),
        },
        (position) => {
          if (!isMounted || isCompletingDeliveryRef.current) return;
          setTrackingError("");
          updateLiveRider(position);
        },
      );
    };

    startWatching().catch(() => {
      if (isMounted) setTrackingError(copy.orderDetails.trackingStartError);
    });

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [
    copy.orderDetails.trackingPermissionError,
    copy.orderDetails.trackingStartError,
    copy.orderDetails.trackingWaitingFirstLocation,
    isFocusedLiveTrip,
    order?.status,
    orderId,
    trackingPolicy.distanceIntervalMeters,
    trackingPolicy.updateIntervalSeconds,
    updateLiveRider,
  ]);

  const handleAccept = useCallback(async () => {
    if (!order) return;
    if (!isNetworkOnline) {
      Alert.alert(copy.common.offline, t.reconnectAccept);
      return;
    }
    if (isAssignmentsPaused) {
      Alert.alert(t.paused, offlineAcceptWarning);
      return;
    }
    try {
      await acceptMutation.mutateAsync(order.id);
    } catch (error) {
      Alert.alert(
        copy.orderDetails.acceptFailed,
        error instanceof Error ? error.message : copy.orderDetails.acceptFailedText,
      );
    }
  }, [
    acceptMutation,
    copy.common.offline,
    copy.orderDetails.acceptFailed,
    copy.orderDetails.acceptFailedText,
    isAssignmentsPaused,
    isNetworkOnline,
    offlineAcceptWarning,
    order,
    t.paused,
    t.reconnectAccept,
  ]);

  const handlePickup = useCallback(async () => {
    if (!order || isPickupBusy) return;
    if (!isNetworkOnline) {
      Alert.alert(copy.common.offline, t.reconnectDelivery);
      return;
    }

    setIsPickupPreparing(true);

    try {
      const permission = await requestRiderForegroundPermission();
      if (permission.status !== "granted") {
        Alert.alert(copy.profile.locationPermissionTitle, copy.profile.locationPermissionText, [
          { text: "Not now", style: "cancel" },
          { text: "Settings", onPress: () => void openRiderLocationSettings() },
        ]);
        return;
      }

      let pickupLocationPayload: RiderLocationPayload;
      try {
        pickupLocationPayload = await getPickupLocationPayload();
      } catch {
        const fallbackPosition = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60 * 1000,
        }).catch(() => null);
        if (!fallbackPosition) {
          throw new Error("We could not read this device location. Please turn on GPS and try again.");
        }
        pickupLocationPayload = getRiderLocationPayload(fallbackPosition);
      }

      const pickedUpOrder = await pickupMutation.mutateAsync({
        orderId: order.id,
        location: pickupLocationPayload,
      });

      if (pickedUpOrder.status === "PickedUp") {
        try {
          await profileLocationMutation.mutateAsync(pickupLocationPayload);
          await orderQuery.refetch();
          setTrackingError("");
        } catch {
          setTrackingError(copy.orderDetails.pickupSavedWaiting);
        }

        void startRiderBackgroundLocationAsync({
          timeIntervalMs: trackingPolicy.updateIntervalSeconds * 1000,
          distanceIntervalMeters: trackingPolicy.distanceIntervalMeters,
          notificationBody: "Foodbela is sharing your live delivery location.",
        });
      }
    } catch (error) {
      Alert.alert(
        copy.orderDetails.pickupFailed,
        error instanceof Error ? error.message : copy.orderDetails.pickupFailedText,
      );
    } finally {
      setIsPickupPreparing(false);
    }
  }, [
    copy.common.offline,
    copy.orderDetails.pickupFailed,
    copy.orderDetails.pickupFailedText,
    copy.orderDetails.pickupSavedWaiting,
    copy.profile.locationPermissionText,
    copy.profile.locationPermissionTitle,
    isPickupBusy,
    isNetworkOnline,
    order,
    orderQuery,
    pickupMutation,
    profileLocationMutation,
    t.reconnectDelivery,
    trackingPolicy.distanceIntervalMeters,
    trackingPolicy.updateIntervalSeconds,
  ]);

  const completeDelivery = useCallback(async () => {
    if (!order) return;
    isCompletingDeliveryRef.current = true;
    try {
      await deliverMutation.mutateAsync(order.id);
      await stopRiderBackgroundLocationAsync();
      router.replace("/(app)/history");
    } catch (error) {
      isCompletingDeliveryRef.current = false;
      Alert.alert(
        copy.orderDetails.deliverFailed,
        error instanceof Error ? error.message : copy.orderDetails.deliverFailedText,
      );
    }
  }, [
    copy.orderDetails.deliverFailed,
    copy.orderDetails.deliverFailedText,
    deliverMutation,
    order,
  ]);

  const handleDeliver = useCallback(async () => {
    if (!order) return;
    if (!isNetworkOnline) {
      Alert.alert(copy.common.offline, t.reconnectDelivery);
      return;
    }
    if (order.riderTracking?.isNearCustomer === false) {
      Alert.alert(
        "Confirm customer location",
        "You do not look close to the customer yet. Mark delivered only if the order is handed over.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Mark delivered", style: "destructive", onPress: () => void completeDelivery() },
        ],
      );
      return;
    }
    await completeDelivery();
  }, [completeDelivery, copy.common.offline, isNetworkOnline, order, t.reconnectDelivery]);

  const handleActivateTracking = useCallback(async () => {
    if (!isNetworkOnline) {
      Alert.alert(copy.common.offline, t.reconnectTracking);
      return;
    }
    try {
      await activateTrackingMutation.mutateAsync(order!.id);
    } catch (error) {
      Alert.alert(
        copy.orderDetails.trackingSwitchFailed,
        error instanceof Error ? error.message : copy.orderDetails.trackingSwitchFailedText,
      );
    }
  }, [
    activateTrackingMutation,
    copy.common.offline,
    copy.orderDetails.trackingSwitchFailed,
    copy.orderDetails.trackingSwitchFailedText,
    isNetworkOnline,
    order,
    t.reconnectTracking,
  ]);

  const handleBackPress = useCallback(() => {
    const canGoBack = (router as unknown as { canGoBack?: () => boolean }).canGoBack?.() ?? false;
    if (canGoBack) {
      router.back();
      return;
    }
    router.replace("/(app)/active");
  }, []);

  if (!rider || !accessToken) {
    return (
      <Redirect
        href={{
          pathname: "/sign-in",
          params: { redirectTo: orderId ? `/orders/${orderId}` : "/(app)/available" },
        }}
      />
    );
  }

  const isOrderLoading =
    Boolean(orderId) && !order && (orderQuery.isLoading || orderQuery.isFetching || !orderQuery.isError);

  if (isOrderLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={palette.primaryStrong} />
          <Text style={styles.emptyText}>Loading order details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Pressable style={styles.centeredBackButton} onPress={handleBackPress}>
            <Ionicons name="arrow-back" size={18} color={palette.foreground} />
          </Pressable>
          <Text style={styles.emptyText}>{copy.orderDetails.unavailable}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed ? styles.retryButtonPressed : null]}
            onPress={() => void orderQuery.refetch()}
          >
            {orderQuery.isFetching ? (
              <ActivityIndicator size="small" color={palette.surface} />
            ) : (
              <Ionicons name="refresh" size={16} color={palette.surface} />
            )}
            <Text style={styles.retryButtonText}>{copy.common.retry}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const orderStatusBadge = getOrderStatusBadge(order.status);
  const orderTotalLabel = formatMoney(order.pricing?.total);
  const paymentMethodLabel = formatPaymentMethod(order.paymentMethod);
  const paymentBadge = getPaymentMethodBadge(order.paymentMethod);
  const phase = isPickedUp ? "to_customer" : "to_restaurant";
  const showPlannedDeliveryLeg = !isPickedUp && Boolean(restaurantCoordinate && customerCoordinate);
  const collapsedHeight = 238 + Math.max(insets.bottom, 8);
  const expandedHeight = Math.max(
    collapsedHeight + 240,
    Math.min(windowHeight * 0.78, windowHeight - insets.top - 12),
  );

  const customerPhone = order.customer?.phone;
  const restaurantPhone = order.restaurant?.phone;
  const showLiveTripActivation = order.status === "PickedUp" && !isFocusedLiveTrip;
  const hasTrackingIssue = !isNetworkOnline || Boolean(trackingError);
  const syncDotStyle = hasTrackingIssue ? styles.syncDotOffline : styles.syncDotLive;
  const syncStatusLabel = hasTrackingIssue ? t.offline : t.live;
  const tripModeLabel = isPreviewOnlyRoute
    ? "Preview only"
    : isPickedUp
      ? isFocusedLiveTrip
        ? "Live tracking shared"
        : "Not the live trip"
      : isAssignedPrePickup
        ? "Pickup leg active"
        : isAcceptStep
          ? "Ready to accept"
          : "Order route";
  const destinationName = isPickedUp
    ? order.customer?.name || copy.common.customer
    : order.restaurant?.name || copy.common.restaurant;
  const trackingHeaderLabel = isFocusedLiveTrip
    ? "Live tracking"
    : isPreviewOnlyRoute
      ? "Preview"
      : isPickedUp
        ? "Tracking not shared"
        : "Pickup view";

  const renderPrimaryAction = () => {
    if (isAcceptStep) {
      return (
        <Pressable
          style={[styles.acceptButton, isAcceptDisabled && styles.buttonDisabled]}
          onPress={handleAccept}
          disabled={isAcceptDisabled}
        >
          {acceptMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.acceptButtonText}>
                {!isNetworkOnline ? t.reconnect : copy.orderDetails.acceptOrder}
              </Text>
            </>
          )}
        </Pressable>
      );
    }

    if (isPickupStep) {
      return (
        <HoldToConfirmButton
          label={!isNetworkOnline ? t.reconnect : copy.orderDetails.pickUpOrder}
          icon="bag-handle"
          loading={isPickupBusy}
          disabled={isPickupDisabled}
          tone="pickup"
          onConfirm={() => void handlePickup()}
          onHoldingChange={(holding: boolean) => setActiveHoldAction(holding ? "pickup" : null)}
        />
      );
    }

    if (order.status === "PickedUp") {
      return (
        <HoldToConfirmButton
          label={!isNetworkOnline ? t.reconnect : copy.orderDetails.holdToDeliver}
          icon="checkmark-done"
          loading={deliverMutation.isPending}
          disabled={isDeliverDisabled}
          tone="deliver"
          onConfirm={() => void handleDeliver()}
          onHoldingChange={(holding: boolean) => setActiveHoldAction(holding ? "deliver" : null)}
        />
      );
    }

    return null;
  };

  return (
    <View style={styles.root}>
      <RiderLiveMap
        ref={liveMapRef}
        phase={phase}
        restaurantLocation={restaurantCoordinate}
        customerLocation={customerCoordinate}
        riderLocation={riderCoordinate}
        riderHeading={riderHeading}
        routePolyline={order.routeToNext?.polyline}
        showActiveApproachLeg={shouldShowCurrentApproachLeg}
        showPlannedDeliveryLeg={showPlannedDeliveryLeg}
        restaurantName={order.restaurant?.name ?? copy.common.restaurant}
        customerName={order.customer?.name ?? copy.common.customer}
        topInset={insets.top}
        bottomInset={collapsedHeight}
        onOpenExternalNavigation={openInNativeMaps}
        mapStyle={orderDetailsMapStyleQuery.data}
      />

      {customerPhone || restaurantPhone ? (
        <View style={[styles.mapContactCard, { top: insets.top + 64 }]} pointerEvents="box-none">
          {customerPhone ? (
            <Pressable
              style={styles.mapContactButton}
              onPress={() => Linking.openURL(`tel:${customerPhone}`)}
              hitSlop={6}
              accessibilityLabel="Call customer"
            >
              <View style={[styles.mapContactIcon, styles.mapContactIconCustomer]}>
                <Ionicons name="person" size={17} color={palette.secondary} />
              </View>
              <View style={styles.mapContactCallBadge}>
                <Ionicons name="call" size={9} color="#fff" />
              </View>
            </Pressable>
          ) : null}
          {restaurantPhone ? (
            <Pressable
              style={styles.mapContactButton}
              onPress={() => Linking.openURL(`tel:${restaurantPhone}`)}
              hitSlop={6}
              accessibilityLabel="Call restaurant"
            >
              <View style={[styles.mapContactIcon, styles.mapContactIconRestaurant]}>
                <Ionicons name="storefront" size={17} color={palette.primary} />
              </View>
              <View style={styles.mapContactCallBadge}>
                <Ionicons name="call" size={9} color="#fff" />
              </View>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.mapMetricsCard, { top: insets.top + 64 }]} pointerEvents="none">
        <View style={styles.mapMetricBlock}>
          <Text style={styles.mapMetricLabel}>DISTANCE</Text>
          <Text style={styles.mapMetricValue} numberOfLines={1}>
            {formatDistanceLabel(currentLegDistanceKm)}
          </Text>
        </View>
        <View style={styles.mapMetricDivider} />
        <View style={styles.mapMetricBlock}>
          <Text style={styles.mapMetricLabel}>TIME</Text>
          <Text style={styles.mapMetricValue} numberOfLines={1}>
            {formatEtaLabel(displayedEtaMinutes)}
          </Text>
        </View>
      </View>

      {/* Floating header over the map */}
      <View style={[styles.header, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable style={styles.headerButton} onPress={handleBackPress}>
          <Ionicons name="arrow-back" size={20} color={palette.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View
            style={[
              styles.headerTrackingPill,
              isFocusedLiveTrip && styles.headerTrackingPillLive,
              isPreviewOnlyRoute && styles.headerTrackingPillPreview,
            ]}
          >
            <View
              style={[
                styles.headerTrackingDot,
                isFocusedLiveTrip
                  ? styles.headerTrackingDotLive
                  : isPreviewOnlyRoute
                    ? styles.headerTrackingDotPreview
                    : styles.headerTrackingDotNeutral,
              ]}
            />
            <Text
              style={[
                styles.headerTrackingText,
                isFocusedLiveTrip && styles.headerTrackingTextLive,
                isPreviewOnlyRoute && styles.headerTrackingTextPreview,
              ]}
              numberOfLines={1}
            >
              {trackingHeaderLabel}
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.headerStatusOnly,
            {
              backgroundColor: orderStatusBadge.backgroundColor,
              borderColor: orderStatusBadge.borderColor,
            },
          ]}
        >
          <Text style={[styles.headerStatusOnlyText, { color: orderStatusBadge.color }]}>
            {orderStatusBadge.label}
          </Text>
        </View>
      </View>

      <PersistentBottomSheet
        collapsedHeight={collapsedHeight}
        expandedHeight={expandedHeight}
        dragEnabled={activeHoldAction === null}
        peekDragHeight={118}
        scrollEnabled={activeHoldAction === null}
        onExpandedChange={setSheetExpanded}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        peek={
          <View style={styles.peek}>
            <View style={styles.peekTopRow}>
              <View style={styles.peekOrderRow}>
                <Text style={styles.peekOrderLabel}>Order ID</Text>
                <Text style={styles.peekOrderValue} numberOfLines={1}>
                  {order.orderNumber}
                </Text>
              </View>
              <View
                style={[
                  styles.tripModeChip,
                  isFocusedLiveTrip && styles.tripModeChipLive,
                  isPreviewOnlyRoute && styles.tripModeChipPreview,
                ]}
              >
                <View
                  style={[
                    styles.tripModeDot,
                    isFocusedLiveTrip
                      ? styles.tripModeDotLive
                      : isPreviewOnlyRoute
                        ? styles.tripModeDotPreview
                        : styles.tripModeDotNeutral,
                  ]}
                />
                <Text
                  style={[
                    styles.tripModeText,
                    isFocusedLiveTrip && styles.tripModeTextLive,
                    isPreviewOnlyRoute && styles.tripModeTextPreview,
                  ]}
                  numberOfLines={1}
                >
                  {tripModeLabel}
                </Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View
                style={[
                  styles.legIcon,
                  isPickedUp ? styles.legIconCustomer : styles.legIconRestaurant,
                ]}
              >
                <Ionicons
                  name={isPickedUp ? "home" : "storefront"}
                  size={18}
                  color="#fff"
                />
              </View>
              <View style={styles.summaryCopy}>
                <View style={styles.summaryTitleRow}>
                  <View style={[styles.summarySyncDot, syncDotStyle]} />
                  <Text style={styles.summaryTitle} numberOfLines={1}>
                    {activeLegLabel}
                  </Text>
                </View>
                <Text style={styles.summaryMeta} numberOfLines={1}>
                  {destinationName}
                  {!sheetExpanded ? `  ·  ${t.tapForDetails}` : ""}
                </Text>
              </View>
              <View style={styles.priceBubble}>
                <Text style={styles.priceBubbleLabel}>TOTAL</Text>
                <Text style={styles.priceBubbleValue} numberOfLines={1}>
                  {orderTotalLabel}
                </Text>
              </View>
            </View>

            {renderPrimaryAction()}
          </View>
        }
      >
        {!isNetworkOnline ||
        (!riderCoordinate && !isPickedUp) ||
        (isAssignmentsPaused && order.assignmentState === "unassigned") ? (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={18} color={palette.warningText} />
            <Text style={styles.warningText}>
              {!isNetworkOnline
                ? t.reconnectTracking
                : !riderCoordinate && !isPickedUp
                  ? copy.orderDetails.riderLocationWarning
                  : offlineAcceptWarning}
            </Text>
          </View>
        ) : null}

        {showLiveTripActivation ? (
          <Pressable
            style={[styles.secondaryAction, isTrackingActivationDisabled && styles.buttonDisabled]}
            onPress={handleActivateTracking}
            disabled={isTrackingActivationDisabled}
          >
            {activateTrackingMutation.isPending ? (
              <ActivityIndicator size="small" color={palette.primaryStrong} />
            ) : (
              <>
                <Ionicons name="navigate-outline" size={18} color={palette.primaryStrong} />
                <Text style={styles.secondaryActionText}>
                  {!isNetworkOnline ? t.reconnect : copy.orderDetails.makeLiveTrip}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        {deliveryDelayState ? (
          <View
            style={[
              styles.deliveryDelayCard,
              deliveryDelayState.level === "critical"
                ? styles.deliveryDelayCritical
                : deliveryDelayState.level === "late"
                  ? styles.deliveryDelayLate
                  : styles.deliveryDelayWatch,
            ]}
          >
            <View style={styles.deliveryDelayHeader}>
              <View style={styles.deliveryDelayTitleRow}>
                <Ionicons
                  name={deliveryDelayState.icon}
                  size={18}
                  color={
                    deliveryDelayState.level === "critical"
                      ? palette.danger
                      : deliveryDelayState.level === "late"
                        ? palette.secondary
                        : palette.warning
                  }
                />
                <Text
                  style={[
                    styles.deliveryDelayTitle,
                    deliveryDelayState.level === "critical"
                      ? styles.deliveryDelayCriticalText
                      : deliveryDelayState.level === "late"
                        ? styles.deliveryDelayLateText
                        : styles.deliveryDelayWatchText,
                  ]}
                >
                  {deliveryDelayState.title}
                </Text>
              </View>
              <Text style={styles.deliveryDelayTime}>
                {pickedUpElapsedMinutes ?? 0} {t.minOut}
              </Text>
            </View>
            <View style={styles.deliveryDelayTrack}>
              <View
                style={[
                  styles.deliveryDelayFill,
                  {
                    width: `${deliveryDelayProgress * 100}%`,
                    backgroundColor:
                      deliveryDelayState.level === "critical"
                        ? palette.danger
                        : deliveryDelayState.level === "late"
                          ? palette.secondary
                          : palette.amber,
                  },
                ]}
              />
            </View>
            <Text style={styles.deliveryDelayText}>{deliveryDelayState.message}</Text>
            {deliveryDelayState.level !== "watch" && (customerPhone || supportPhone) ? (
              <View style={styles.deliveryDelayActions}>
                {customerPhone ? (
                  <Pressable
                    style={[styles.deliveryDelayAction, styles.deliveryDelayActionPrimary]}
                    onPress={() => Linking.openURL(`tel:${customerPhone}`)}
                  >
                    <Ionicons name="call-outline" size={15} color="#fff" />
                    <Text style={styles.deliveryDelayActionPrimaryText}>Call customer</Text>
                  </Pressable>
                ) : null}
                {supportPhone ? (
                  <Pressable
                    style={styles.deliveryDelayAction}
                    onPress={() => Linking.openURL(`tel:${supportPhone}`)}
                  >
                    <Ionicons name="headset-outline" size={15} color={palette.foreground} />
                    <Text style={styles.deliveryDelayActionText}>Support</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.dualCardRow}>
          <View style={styles.infoCard}>
            <View style={styles.infoHeaderRow}>
              <View style={styles.infoHeaderMain}>
                <View style={[styles.infoIcon, styles.infoIconRestaurant]}>
                  <Ionicons name="storefront-outline" size={16} color={palette.primary} />
                </View>
                <Text style={styles.infoSectionLabel} numberOfLines={1}>
                  {copy.orderDetails.restaurantTitle}
                </Text>
              </View>
              {restaurantPhone ? (
                <Pressable
                  style={styles.cardActionButton}
                  onPress={() => Linking.openURL(`tel:${restaurantPhone}`)}
                >
                  <Ionicons name="call" size={14} color={palette.foreground} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.infoTitle} numberOfLines={1}>
              {order.restaurant?.name ?? copy.common.restaurant}
            </Text>
            {restaurantPhone ? (
              <View style={styles.infoPhoneRow}>
                <Ionicons name="call-outline" size={13} color={palette.primary} />
                <Text style={styles.infoPhoneText} numberOfLines={1}>
                  {restaurantPhone}
                </Text>
              </View>
            ) : null}
            <Text style={styles.infoText} numberOfLines={3}>
              {order.restaurant?.address ?? "--"}
            </Text>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoHeaderRow}>
              <View style={styles.infoHeaderMain}>
                <View style={[styles.infoIcon, styles.infoIconCustomer]}>
                  <Ionicons name="person-outline" size={16} color={palette.secondary} />
                </View>
                <Text style={styles.infoSectionLabel} numberOfLines={1}>
                  {copy.orderDetails.customerTitle}
                </Text>
              </View>
              {customerPhone ? (
                <Pressable
                  style={styles.cardActionButton}
                  onPress={() => Linking.openURL(`tel:${customerPhone}`)}
                >
                  <Ionicons name="call" size={14} color={palette.foreground} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.infoTitle} numberOfLines={1}>
              {order.customer?.name ?? copy.common.customer}
            </Text>
            {customerPhone ? (
              <View style={styles.infoPhoneRow}>
                <Ionicons name="call-outline" size={13} color={palette.secondary} />
                <Text style={styles.infoPhoneText} numberOfLines={1}>
                  {customerPhone}
                </Text>
              </View>
            ) : null}
            <Text style={styles.infoText} numberOfLines={3}>
              {order.customer?.deliveryAddress?.addressLine ??
                order.customer?.deliveryAddress?.label ??
                "--"}
            </Text>
            {order.customer?.deliveryAddress?.addressDetails ? (
              <Text style={styles.infoText} numberOfLines={2}>
                {order.customer.deliveryAddress.addressDetails}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.cardSectionHeader}>
            <Text style={styles.sectionTitle}>{copy.orderDetails.itemsTitle}</Text>
            <View style={styles.sectionCountBadge}>
              <Text style={styles.sectionCountText}>{itemRows.length}</Text>
            </View>
          </View>
          <View style={styles.orderSummaryStrip}>
            <View style={styles.paymentSummaryBlock}>
              <View style={styles.paymentSummaryHeader}>
                <Ionicons name="wallet" size={14} color={palette.surface} />
                <Text style={styles.orderSummaryLabelDark}>Payment</Text>
              </View>
              <View style={styles.paymentMethodBadgeDark}>
                <Ionicons name={paymentBadge.icon} size={14} color={palette.surface} />
                <Text style={styles.paymentMethodBadgeTextDark}>{paymentBadge.label}</Text>
              </View>
              <Text style={styles.paymentMethodHintDark}>{paymentMethodLabel}</Text>
            </View>
            <View style={styles.orderSummaryDivider} />
            <View style={styles.orderSummaryBlockRight}>
              <Text style={styles.orderSummaryLabelDark}>Total</Text>
              <Text style={styles.orderSummaryTotal}>{orderTotalLabel}</Text>
            </View>
          </View>
          <View style={styles.itemList}>
            {itemRows.map(
              (item: { name?: string; quantity?: number; totalPrice?: number }, index: number) => (
                <View key={`${item.name}-${index}`} style={styles.itemRow}>
                  <View style={styles.itemQuantityPill}>
                    <Text style={styles.itemQuantity}>{item.quantity ?? 1}x</Text>
                  </View>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {typeof item.totalPrice === "number" ? (
                    <Text style={styles.itemPrice}>Tk {Math.round(item.totalPrice)}</Text>
                  ) : null}
                </View>
              ),
            )}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.cardSectionHeader}>
            <Text style={styles.sectionTitle}>{copy.orderDetails.timelineTitle}</Text>
            <View style={styles.sectionCountBadge}>
              <Text style={styles.sectionCountText}>{timelineRows.length}</Text>
            </View>
          </View>
          <View style={styles.timelineList}>
            {timelineRows.map(
              (entry: { status: string; createdAt: string | null }, index: number) => {
                const timelineBadge = getOrderStatusBadge(entry.status);
                const isLast = index === timelineRows.length - 1;
                return (
                  <View key={`${entry.status}-${index}`} style={styles.timelineRow}>
                    <View style={styles.timelineMarkerWrap}>
                      <View style={[styles.timelineDot, { backgroundColor: timelineBadge.color }]} />
                      {!isLast ? <View style={styles.timelineLine} /> : null}
                    </View>
                    <View style={styles.timelineCopyWrap}>
                      <View
                        style={[
                          styles.timelineStatusChip,
                          {
                            backgroundColor: timelineBadge.backgroundColor,
                            borderColor: timelineBadge.borderColor,
                          },
                        ]}
                      >
                        <Text style={[styles.timelineStatus, { color: timelineBadge.color }]}>
                          {timelineBadge.label}
                        </Text>
                      </View>
                      <Text style={styles.timelineMeta}>
                        {formatDateTime(entry.createdAt)}
                        {entry.createdAt ? ` - ${formatRelativeTime(entry.createdAt)}` : ""}
                      </Text>
                    </View>
                  </View>
                );
              },
            )}
          </View>
        </View>

        {shouldShowTripSyncStatus && hasTrackingIssue ? (
          <View style={styles.syncCard}>
            <View style={styles.syncHeaderRow}>
              <Text style={styles.syncTitle}>{syncStatusLabel}</Text>
              <View style={[styles.summarySyncDot, syncDotStyle]} />
            </View>
            <Text style={styles.syncText}>
              {trackingError || t.reconnectTracking}
            </Text>
          </View>
        ) : null}
      </PersistentBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
    padding: 20,
    gap: 14,
  },
  centeredBackButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyText: {
    fontSize: 14,
    color: palette.mutedForeground,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.foreground,
  },
  retryButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: "900",
    color: palette.surface,
  },

  header: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 20,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  headerTrackingPill: {
    maxWidth: 176,
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
  },
  headerTrackingPillLive: {
    backgroundColor: palette.successSoft,
    borderColor: "rgba(20,152,91,0.22)",
  },
  headerTrackingPillPreview: {
    backgroundColor: palette.infoSoft,
    borderColor: "rgba(93,139,255,0.24)",
  },
  headerTrackingDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  headerTrackingDotLive: {
    backgroundColor: palette.success,
  },
  headerTrackingDotPreview: {
    backgroundColor: palette.info,
  },
  headerTrackingDotNeutral: {
    backgroundColor: palette.amber,
  },
  headerTrackingText: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: palette.foreground,
  },
  headerTrackingTextLive: {
    color: palette.successText,
  },
  headerTrackingTextPreview: {
    color: palette.info,
  },
  headerStatusOnly: {
    minWidth: 86,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: palette.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  headerStatusOnlyText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
  },

  mapContactCard: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    gap: 8,
    maxWidth: 116,
    borderRadius: 18,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(31,36,48,0.08)",
    shadowColor: palette.shadow,
    shadowOpacity: 0.95,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    zIndex: 18,
  },
  mapContactButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
    position: "relative",
  },
  mapContactIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  mapContactIconCustomer: {
    backgroundColor: "#FFEAF2",
  },
  mapContactIconRestaurant: {
    backgroundColor: palette.primarySoft,
  },
  mapContactCallBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  mapMetricsCard: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(31,36,48,0.94)",
    shadowColor: palette.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    zIndex: 18,
  },
  mapMetricBlock: {
    minWidth: 58,
    alignItems: "center",
    gap: 2,
  },
  mapMetricDivider: {
    width: 1,
    height: 30,
    marginHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  mapMetricLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "900",
    color: "rgba(255,255,255,0.58)",
  },
  mapMetricValue: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
    color: "#fff",
  },

  peek: {
    paddingHorizontal: 18,
    paddingTop: 2,
    gap: 10,
  },
  peekTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  peekOrderRow: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  peekOrderLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    color: palette.primary,
    textTransform: "uppercase",
  },
  peekOrderValue: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
    color: palette.foreground,
  },
  tripModeChip: {
    maxWidth: 150,
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  tripModeChipLive: {
    backgroundColor: palette.successSoft,
    borderColor: "rgba(20,152,91,0.2)",
  },
  tripModeChipPreview: {
    backgroundColor: palette.infoSoft,
    borderColor: "rgba(93,139,255,0.22)",
  },
  tripModeDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  tripModeDotLive: {
    backgroundColor: palette.success,
  },
  tripModeDotPreview: {
    backgroundColor: palette.info,
  },
  tripModeDotNeutral: {
    backgroundColor: palette.amber,
  },
  tripModeText: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    color: palette.foreground,
  },
  tripModeTextLive: {
    color: palette.successText,
  },
  tripModeTextPreview: {
    color: palette.info,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  legIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  legIconRestaurant: {
    backgroundColor: palette.primary,
  },
  legIconCustomer: {
    backgroundColor: palette.secondary,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  summaryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  summarySyncDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  syncDotLive: {
    backgroundColor: palette.success,
  },
  syncDotSyncing: {
    backgroundColor: palette.amber,
  },
  syncDotOffline: {
    backgroundColor: palette.danger,
  },
  summaryTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  summaryMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
  priceBubble: {
    minWidth: 96,
    maxWidth: 118,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
  },
  priceBubbleLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
  },
  priceBubbleValue: {
    maxWidth: 98,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    color: "#fff",
  },
  acceptButton: {
    minHeight: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.primary,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#fff",
  },
  holdButton: {
    overflow: "hidden",
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: palette.primaryStrong,
    justifyContent: "center",
  },
  holdButtonDeliver: {
    backgroundColor: palette.success,
  },
  holdProgressFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(255,255,255,0.26)",
  },
  holdProgressFillDeliver: {
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  holdButtonContent: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  holdButtonText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#fff",
  },
  buttonDisabled: {
    opacity: 0.65,
  },

  secondaryAction: {
    minHeight: 50,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryActionText: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.primaryStrong,
  },

  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    padding: 14,
    backgroundColor: palette.warningSurface,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: palette.warningText,
    fontWeight: "700",
  },

  deliveryDelayCard: {
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
  },
  deliveryDelayWatch: {
    backgroundColor: palette.warningSurface,
    borderColor: "#FDE68A",
  },
  deliveryDelayLate: {
    backgroundColor: "#FFF0F6",
    borderColor: "#FFCEE0",
  },
  deliveryDelayCritical: {
    backgroundColor: palette.dangerSoft,
    borderColor: "#FECACA",
  },
  deliveryDelayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  deliveryDelayTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deliveryDelayTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  deliveryDelayWatchText: {
    color: palette.warningText,
  },
  deliveryDelayLateText: {
    color: palette.secondary,
  },
  deliveryDelayCriticalText: {
    color: palette.danger,
  },
  deliveryDelayTime: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.foreground,
  },
  deliveryDelayTrack: {
    height: 6,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(33,26,29,0.08)",
  },
  deliveryDelayFill: {
    height: "100%",
    borderRadius: 999,
  },
  deliveryDelayText: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.mutedForeground,
    fontWeight: "700",
  },
  deliveryDelayActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  deliveryDelayAction: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(33,26,29,0.08)",
  },
  deliveryDelayActionPrimary: {
    backgroundColor: palette.foreground,
    borderColor: palette.foreground,
  },
  deliveryDelayActionText: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.foreground,
  },
  deliveryDelayActionPrimaryText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#fff",
  },

  dualCardRow: {
    flexDirection: "row",
    gap: 12,
  },
  infoCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    backgroundColor: palette.surface,
    borderColor: palette.border,
  },
  infoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  infoHeaderMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },
  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoIconRestaurant: {
    backgroundColor: palette.primarySoft,
  },
  infoIconCustomer: {
    backgroundColor: "#FFEAF2",
  },
  infoSectionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.foreground,
  },
  cardActionButton: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  infoTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.foreground,
  },
  infoPhoneRow: {
    minHeight: 22,
    borderRadius: 999,
    paddingHorizontal: 9,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  infoPhoneText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    color: palette.foreground,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.mutedForeground,
  },

  sectionCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.foreground,
  },
  sectionCountBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.foreground,
  },
  orderSummaryStrip: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  paymentSummaryBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 6,
  },
  paymentSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderSummaryLabelDark: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
  },
  paymentMethodBadgeDark: {
    alignSelf: "flex-start",
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  paymentMethodBadgeTextDark: {
    fontSize: 11,
    fontWeight: "900",
    color: palette.surface,
  },
  paymentMethodHintDark: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.72)",
  },
  orderSummaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  orderSummaryBlockRight: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  orderSummaryTotal: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    color: palette.surface,
  },
  itemList: {
    gap: 8,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: palette.surfaceMuted,
  },
  itemQuantityPill: {
    minWidth: 38,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFEAF2",
    borderWidth: 1,
    borderColor: "#FFCEE0",
  },
  itemQuantity: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.secondary,
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.foreground,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  timelineList: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  timelineMarkerWrap: {
    width: 16,
    minHeight: 54,
    alignItems: "center",
  },
  timelineDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    marginTop: 5,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
    backgroundColor: palette.border,
  },
  timelineCopyWrap: {
    flex: 1,
    gap: 6,
    paddingBottom: 14,
  },
  timelineStatusChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  timelineStatus: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
  },
  timelineMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: palette.mutedForeground,
  },
  syncCard: {
    borderRadius: 16,
    padding: 14,
    gap: 6,
    backgroundColor: palette.surfaceMuted,
  },
  syncHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  syncTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.foreground,
  },
  syncText: {
    fontSize: 12,
    color: palette.mutedForeground,
    lineHeight: 18,
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    lineHeight: 18,
  },
});
