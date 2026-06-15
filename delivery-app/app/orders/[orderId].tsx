import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useAcceptOrderMutation,
  useActivateTrackingMutation,
  useDeliverOrderMutation,
  useRiderDeliveryThresholdsQuery,
  usePickupOrderMutation,
  useRiderLiveTrackingPolicyQuery,
  useRiderOrderDetailsQuery,
  useRiderSupportContactQuery,
  useUpdateRiderLocationMutation,
} from "@/src/hooks/use-rider-api";
import { useNetworkStatus } from "@/src/hooks/use-network-status";
import { isBangla, useDeliveryCopy } from "@/src/lib/copy";
import { formatDateTime, formatRelativeTime } from "@/src/lib/date-time";
import { normalizeRiderLiveTrackingPolicy } from "@/src/lib/live-tracking-policy";
import { getOrderStatusBadge, getOrderTimingInfo, getPaymentMethodBadge } from "@/src/lib/rider-order-display";
import {
  setRiderBackgroundTrackingOrderId,
  startRiderBackgroundLocationAsync,
  stopRiderBackgroundLocationAsync,
} from "@/src/lib/rider-background-location";
import {
  getBestAvailableRiderLocationPayload,
  getRiderLocationPayload,
  openRiderLocationSettings,
  requestRiderForegroundPermission,
  type RiderLocationPayload,
} from "@/src/lib/rider-location-permissions";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

type Coordinate = { latitude: number; longitude: number };
type FocusMode = "customer" | "restaurant" | "rider" | "overview";

const HOLD_DURATION_MS = 900;
const MAX_QUEUED_LOCATION_UPDATES = 20;
const DEFAULT_DELIVERY_THRESHOLDS = {
  deliveryWatchAfterPickupMinutes: 20,
  deliveryLateAfterPickupMinutes: 25,
  deliveryCriticalAfterPickupMinutes: 30,
  riderEtaSpeedKmph: 24,
  riderEtaRouteFactor: 1.1,
};

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

function estimateCycleEtaMinutes(
  distanceKm: number,
  speedKmph = 24,
  routeFactor = 1.1
) {
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

function buildCurvedPolyline(start: Coordinate, end: Coordinate) {
  const midLatitude = (start.latitude + end.latitude) / 2;
  const midLongitude = (start.longitude + end.longitude) / 2;
  const latitudeOffset = (end.longitude - start.longitude) * 0.12;
  const longitudeOffset = (start.latitude - end.latitude) * 0.12;
  const control = {
    latitude: midLatitude + latitudeOffset,
    longitude: midLongitude + longitudeOffset,
  };

  return Array.from({ length: 18 }, (_, index) => {
    const t = index / 17;
    return {
      latitude:
        (1 - t) * (1 - t) * start.latitude +
        2 * (1 - t) * t * control.latitude +
        t * t * end.latitude,
      longitude:
        (1 - t) * (1 - t) * start.longitude +
        2 * (1 - t) * t * control.longitude +
        t * t * end.longitude,
    };
  });
}

function RouteMarkerBadge({
  icon,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: "restaurant" | "customer" | "rider";
}) {
  return (
    <View style={styles.mapMarkerWrap}>
      <View
        style={[
          styles.mapMarkerPin,
          tone === "restaurant"
            ? styles.mapMarkerRestaurant
            : tone === "customer"
              ? styles.mapMarkerCustomer
              : styles.mapMarkerRider,
        ]}
      >
        <Ionicons name={icon} size={14} color="#fff" />
      </View>
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildAdaptiveRegion(points: (Coordinate | null | undefined)[], singlePointDelta = 0.014) {
  const validPoints = points.filter((point): point is Coordinate => Boolean(point));

  if (!validPoints.length) return undefined;

  if (validPoints.length === 1) {
    return {
      latitude: validPoints[0].latitude,
      longitude: validPoints[0].longitude,
      latitudeDelta: singlePointDelta,
      longitudeDelta: singlePointDelta * 0.82,
    } satisfies Region;
  }

  const latitudes = validPoints.map((point) => point.latitude);
  const longitudes = validPoints.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  let widestDistanceKm = 0;
  for (let index = 0; index < validPoints.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < validPoints.length; nextIndex += 1) {
      widestDistanceKm = Math.max(
        widestDistanceKm,
        calculateDistanceKm(validPoints[index], validPoints[nextIndex])
      );
    }
  }

  const distanceDelta = clamp(Math.max(0.012, widestDistanceKm * 0.02), 0.012, 0.28);
  const latitudeDelta = clamp(Math.max((maxLatitude - minLatitude) * 1.55, distanceDelta), 0.012, 0.32);
  const longitudeDelta = clamp(
    Math.max((maxLongitude - minLongitude) * 1.55, distanceDelta * 0.9),
    0.01,
    0.32
  );

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta,
    longitudeDelta,
  } satisfies Region;
}

function tightenRegion(region: Region | undefined, factor = 0.78) {
  if (!region) return undefined;

  return {
    ...region,
    latitudeDelta: clamp(region.latitudeDelta * factor, 0.008, 0.24),
    longitudeDelta: clamp(region.longitudeDelta * factor, 0.007, 0.24),
  } satisfies Region;
}

export default function RiderOrderDetailsScreen() {
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = params.orderId;
  const rider = useRiderAuthStore((state) => state.rider);
  const accessToken = useRiderAuthStore((state) => state.accessToken);
  const { copy, language } = useDeliveryCopy();
  const isNetworkOnline = useNetworkStatus();
  const detailCopy = useMemo(
    () =>
      isBangla(language)
        ? {
            mapView: "ম্যাপ ভিউ",
            customerView: "কাস্টমার",
            restaurantView: "রেস্টুরেন্ট",
            riderView: "রাইডার",
            overviewView: "সবগুলো",
            liveEstimate: "লাইভ ডেলিভারি হিসাব",
            tripEarning: "ট্রিপ তথ্য",
            currentSync: "সিঙ্ক অবস্থা",
            routeSummary: "রুট সারাংশ",
            perspectiveHint: "চেপে পরের ভিউ দেখুন",
            holdTitle: "ডেলিভারি সম্পন্ন করতে ধরে রাখুন",
            holdHint: "বার পূর্ণ হলে ডেলিভারি সম্পন্ন হবে",
            releaseHint: "ছেড়ে দিলে বাতিল হবে",
            keepHolding: (seconds: string) => `${seconds} সেকেন্ড ধরে রাখুন`,
            completing: "ডেলিভারি সম্পন্ন করা হচ্ছে...",
            restaurantAddress: "ঠিকানা",
            restaurantPhone: "ফোন",
            openInMaps: "ম্যাপে খুলুন",
            etaLabel: "ETA",
            riderToRestaurant: "রাইডার থেকে রেস্টুরেন্ট",
            riderToCustomer: "রাইডার থেকে কাস্টমার",
            restaurantToCustomer: "রেস্টুরেন্ট থেকে কাস্টমার",
            focusHint: "ফোকাস বেছে নিন",
          }
        : {
            mapView: "Map view",
            customerView: "Customer",
            restaurantView: "Restaurant",
            riderView: "Rider",
            overviewView: "Overview",
            liveEstimate: "Live delivery estimate",
            tripEarning: "Trip details",
            currentSync: "Sync status",
            routeSummary: "Route summary",
            perspectiveHint: "Tap to switch to the next view",
            holdTitle: "Hold to complete delivery",
            holdHint: "Delivery completes when the bar fills",
            releaseHint: "Release early to cancel",
            keepHolding: (seconds: string) => `Keep holding • ${seconds}s`,
            completing: "Completing delivery...",
            restaurantAddress: "Address",
            restaurantPhone: "Phone",
            openInMaps: "Open in Maps",
            etaLabel: "ETA",
            riderToRestaurant: "Rider to restaurant",
            riderToCustomer: "Rider to customer",
            restaurantToCustomer: "Restaurant to customer",
            focusHint: "Choose focus",
            reconnectAction: "Reconnect to continue",
            reconnectTracking: "Reconnect to resume live updates and trip actions.",
            reconnectAccept: "Reconnect before accepting this order.",
            reconnectDelivery: "Reconnect before updating this trip.",
            pausedAssignments: "Paused",
          },
    [language]
  );
  const detailText = detailCopy as Record<string, unknown>;
  const reconnectActionLabel =
    typeof detailText.reconnectAction === "string"
      ? detailText.reconnectAction
      : language === "bn"
        ? "আবার যোগাযোগ করুন"
        : "Reconnect to continue";
  const reconnectTrackingLabel =
    typeof detailText.reconnectTracking === "string"
      ? detailText.reconnectTracking
      : language === "bn"
        ? "লাইভ আপডেট আর ট্রিপ অ্যাকশন চালু রাখতে আবার যোগাযোগ করুন।"
        : "Reconnect to resume live updates and trip actions.";
  const reconnectAcceptLabel =
    typeof detailText.reconnectAccept === "string"
      ? detailText.reconnectAccept
      : language === "bn"
        ? "এই অর্ডার গ্রহণ করার আগে আবার যোগাযোগ করুন।"
        : "Reconnect before accepting this order.";
  const reconnectDeliveryLabel =
    typeof detailText.reconnectDelivery === "string"
      ? detailText.reconnectDelivery
      : language === "bn"
        ? "এই ট্রিপ আপডেট করার আগে আবার যোগাযোগ করুন।"
        : "Reconnect before updating this trip.";
  const pausedAssignmentsLabel =
    typeof detailText.pausedAssignments === "string"
      ? detailText.pausedAssignments
      : language === "bn"
        ? "পজ করা"
        : "Paused";

  const [trackingError, setTrackingError] = useState("");
  const [syncState, setSyncState] = useState<"live" | "syncing" | "offline">("live");
  const [queuedLocationCount, setQueuedLocationCount] = useState(0);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [focusMode, setFocusMode] = useState<FocusMode>("overview");
  const [holdProgress, setHoldProgress] = useState(0);
  const [activeHoldAction, setActiveHoldAction] = useState<"pickup" | "deliver" | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const lastLocationSentAtRef = useRef(0);
  const isCompletingDeliveryRef = useRef(false);
  const isLocationMutationPendingRef = useRef(false);
  const queuedLocationsRef = useRef<RiderLocationPayload[]>([]);
  const isFlushingQueueRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const flushLocationQueueRef = useRef<() => Promise<void>>(async () => undefined);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartedAtRef = useRef<number | null>(null);
  const holdCompleteRef = useRef<(() => void) | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const mapReadyRef = useRef(false);
  const orderQuery = useRiderOrderDetailsQuery(orderId);
  const trackingPolicyQuery = useRiderLiveTrackingPolicyQuery();
  const deliveryThresholdsQuery = useRiderDeliveryThresholdsQuery();
  const supportContactQuery = useRiderSupportContactQuery();
  const trackingPolicy = normalizeRiderLiveTrackingPolicy(trackingPolicyQuery.data);
  const acceptMutation = useAcceptOrderMutation();
  const activateTrackingMutation = useActivateTrackingMutation();
  const pickupMutation = usePickupOrderMutation();
  const deliverMutation = useDeliverOrderMutation();
  const locationMutation = useUpdateRiderLocationMutation(orderId);
  const mutateRiderLocation = locationMutation.mutateAsync;

  useEffect(() => {
    isLocationMutationPendingRef.current = locationMutation.isPending;
  }, [locationMutation.isPending]);

  const order = orderQuery.data;
  const supportPhone = supportContactQuery.data?.phone;
  const backgroundTrackingStatus = order?.status;
  const isFocusedLiveTrip = Boolean(order?.isFocusedLiveTrip);
  const backgroundTrackingEnabled =
    order?.status === "PickedUp" && Boolean(rider?.activeTrackingOrderId);
  const isAssignmentsPaused = rider?.isAvailableForAssignments === false;
  const trackingLocation = order?.riderTracking?.currentLocation;
  const lastKnownRiderLocation = rider?.lastKnownLocation;
  const restaurantCoordinate = useMemo(
    () =>
      typeof order?.restaurant?.latitude === "number" && typeof order?.restaurant?.longitude === "number"
        ? {
            latitude: order.restaurant.latitude,
            longitude: order.restaurant.longitude,
          }
        : null,
    [order?.restaurant?.latitude, order?.restaurant?.longitude]
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
    [order?.customer?.deliveryAddress?.latitude, order?.customer?.deliveryAddress?.longitude]
  );
  const riderCoordinate = useMemo(
    () =>
      typeof trackingLocation?.latitude === "number" && typeof trackingLocation?.longitude === "number"
        ? {
            latitude: trackingLocation.latitude,
            longitude: trackingLocation.longitude,
          }
        : typeof lastKnownRiderLocation?.latitude === "number" &&
            typeof lastKnownRiderLocation?.longitude === "number"
          ? {
              latitude: lastKnownRiderLocation.latitude,
              longitude: lastKnownRiderLocation.longitude,
            }
          : null,
    [
      lastKnownRiderLocation?.latitude,
      lastKnownRiderLocation?.longitude,
      trackingLocation?.latitude,
      trackingLocation?.longitude,
    ]
  );

  const isPickedUp = order?.status === "PickedUp";
  const deliveryThresholds = deliveryThresholdsQuery.data ?? DEFAULT_DELIVERY_THRESHOLDS;

  useEffect(() => {
    if (!isPickedUp) return;
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => clearInterval(timer);
  }, [isPickedUp]);

  const pickedUpAt = order?.timestamps?.PickedUp ?? order?.timestamps?.pickedUpAt ?? null;
  const pickedUpElapsedMinutes = isPickedUp
    ? getElapsedMinutes(pickedUpAt, nowMs)
    : null;
  const deliveryDelayState = useMemo(() => {
    if (!isPickedUp || pickedUpElapsedMinutes === null) return null;

    if (
      pickedUpElapsedMinutes >=
      deliveryThresholds.deliveryCriticalAfterPickupMinutes
    ) {
      return {
        level: "critical" as const,
        title: "Critical delivery delay",
        message: "Admin can now follow up. Keep location on and call support if blocked.",
        icon: "alert-circle-outline" as const,
      };
    }

    if (
      pickedUpElapsedMinutes >= deliveryThresholds.deliveryLateAfterPickupMinutes
    ) {
      return {
        level: "late" as const,
        title: "Delivery is running late",
        message: "Customer ETA may be affected. Move to the drop point or contact support.",
        icon: "time-outline" as const,
      };
    }

    if (
      pickedUpElapsedMinutes >= deliveryThresholds.deliveryWatchAfterPickupMinutes
    ) {
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
  const deliveryDelayProgress = pickedUpElapsedMinutes === null
    ? 0
    : clamp(
        pickedUpElapsedMinutes /
          deliveryThresholds.deliveryCriticalAfterPickupMinutes,
        0,
        1
      );
  const isAssignedPrePickup =
    order?.status === "ReadyForPickup" && order?.assignmentState === "assigned_to_you";
  const isAcceptStep = order?.status === "ReadyForPickup" && order?.assignmentState === "unassigned";
  const isPickupStep = order?.status === "ReadyForPickup" && order?.assignmentState === "assigned_to_you";
  const hasAnotherActiveLiveTrip =
    Boolean(rider?.activeTrackingOrderId) && rider?.activeTrackingOrderId !== order?.id;
  const isPreviewOnlyRoute =
    isAssignedPrePickup &&
    !order?.isTrackingActiveForRider &&
    hasAnotherActiveLiveTrip;
  const shouldShowCurrentApproachLeg =
    isPickedUp ? true : isAssignedPrePickup && !isPreviewOnlyRoute;
  const statusLabel = !isNetworkOnline
    ? copy.common.offline
    : isAssignmentsPaused
      ? pausedAssignmentsLabel
      : copy.common.online;
  const isAcceptDisabled = !isNetworkOnline || isAssignmentsPaused || acceptMutation.isPending;
  const isPickupDisabled = !isNetworkOnline || pickupMutation.isPending;
  const isDeliverDisabled = !isNetworkOnline || deliverMutation.isPending;
  const isTrackingActivationDisabled = !isNetworkOnline || activateTrackingMutation.isPending;
  const offlineAcceptWarning =
    copy.orderDetails.warningOfflineAccept ?? "Reconnect before accepting a new order.";

  const activePrimaryRoute = useMemo(() => {
    if (isPickedUp && shouldShowCurrentApproachLeg && riderCoordinate && customerCoordinate) {
      return buildCurvedPolyline(riderCoordinate, customerCoordinate);
    }
    if (isAssignedPrePickup && shouldShowCurrentApproachLeg && riderCoordinate && restaurantCoordinate) {
      return buildCurvedPolyline(riderCoordinate, restaurantCoordinate);
    }
    return [] as Coordinate[];
  }, [
    customerCoordinate,
    isAssignedPrePickup,
    isPickedUp,
    restaurantCoordinate,
    riderCoordinate,
    shouldShowCurrentApproachLeg,
  ]);

  const plannedDeliveryRoute = useMemo(() => {
    if (isPickedUp) return [] as Coordinate[];
    if (!restaurantCoordinate || !customerCoordinate) return [] as Coordinate[];
    return buildCurvedPolyline(restaurantCoordinate, customerCoordinate);
  }, [customerCoordinate, isPickedUp, restaurantCoordinate]);

  const currentLegDistanceKm = useMemo(() => {
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
  }, [customerCoordinate, isPickedUp, order?.riderTracking?.remainingDistanceKm, restaurantCoordinate, riderCoordinate]);

  const nextLegDistanceKm = useMemo(() => {
    if (isPickedUp) return null;
    return restaurantCoordinate && customerCoordinate
      ? calculateDistanceKm(restaurantCoordinate, customerCoordinate)
      : null;
  }, [customerCoordinate, isPickedUp, restaurantCoordinate]);

  const currentLegEtaMinutes = useMemo(() => {
    if (isPickedUp && typeof order?.riderTracking?.remainingDurationMinutes === "number") {
      return Math.max(1, Math.round(order.riderTracking.remainingDurationMinutes));
    }
    return typeof currentLegDistanceKm === "number"
      ? estimateCycleEtaMinutes(
          currentLegDistanceKm,
          deliveryThresholds.riderEtaSpeedKmph,
          deliveryThresholds.riderEtaRouteFactor
        )
      : null;
  }, [
    currentLegDistanceKm,
    deliveryThresholds.riderEtaRouteFactor,
    deliveryThresholds.riderEtaSpeedKmph,
    isPickedUp,
    order?.riderTracking?.remainingDurationMinutes,
  ]);

  const nextLegEtaMinutes = useMemo(
    () =>
      typeof nextLegDistanceKm === "number"
        ? estimateCycleEtaMinutes(
            nextLegDistanceKm,
            deliveryThresholds.riderEtaSpeedKmph,
            deliveryThresholds.riderEtaRouteFactor
          )
        : null,
    [
      deliveryThresholds.riderEtaRouteFactor,
      deliveryThresholds.riderEtaSpeedKmph,
      nextLegDistanceKm,
    ]
  );

  const displayedEtaMinutes = currentLegEtaMinutes ?? nextLegEtaMinutes ?? null;

  const activeLegLabel = isPickedUp ? "To customer" : "To restaurant";

  const availableFocusModes = useMemo(() => {
    const modes: FocusMode[] = [];
    if (customerCoordinate) modes.push("customer");
    if (restaurantCoordinate) modes.push("restaurant");
    if (riderCoordinate) modes.push("rider");
    modes.push("overview");
    return modes;
  }, [customerCoordinate, restaurantCoordinate, riderCoordinate]);

  useEffect(() => {
    if (!availableFocusModes.includes(focusMode)) {
      setFocusMode(availableFocusModes[0] ?? "overview");
    }
  }, [availableFocusModes, focusMode]);

  const activeMapRegion = useMemo(() => {
    switch (focusMode) {
      case "customer":
        return tightenRegion(
          buildAdaptiveRegion(
            [customerCoordinate, riderCoordinate ?? restaurantCoordinate],
            0.011
          ),
          0.7
        );
      case "restaurant":
        return tightenRegion(
          buildAdaptiveRegion(
            [restaurantCoordinate, isPickedUp ? customerCoordinate : riderCoordinate ?? customerCoordinate],
            0.011
          ),
          0.7
        );
      case "rider":
        return tightenRegion(
          buildAdaptiveRegion(
            [riderCoordinate, isPickedUp ? customerCoordinate : restaurantCoordinate],
            0.01
          ),
          0.68
        );
      case "overview":
      default:
        return tightenRegion(
          buildAdaptiveRegion([restaurantCoordinate, customerCoordinate, riderCoordinate], 0.014),
          0.84
        );
    }
  }, [customerCoordinate, focusMode, isPickedUp, restaurantCoordinate, riderCoordinate]);

  useEffect(() => {
    if (mapRef.current && activeMapRegion) {
      mapRef.current.animateToRegion(activeMapRegion, 350);
    }
  }, [activeMapRegion]);

  const focusModeMeta = useMemo(() => {
    switch (focusMode) {
      case "customer":
        return { label: detailCopy.customerView, icon: "home-outline" as const };
      case "restaurant":
        return { label: detailCopy.restaurantView, icon: "storefront-outline" as const };
      case "rider":
        return { label: detailCopy.riderView, icon: "bicycle-outline" as const };
      case "overview":
      default:
        return { label: detailCopy.overviewView, icon: "scan-outline" as const };
    }
  }, [detailCopy.customerView, detailCopy.overviewView, detailCopy.restaurantView, detailCopy.riderView, focusMode]);

  const cycleMapFocus = useCallback(() => {
    setFocusMode((current) => {
      const currentIndex = availableFocusModes.indexOf(current);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % availableFocusModes.length;
      return availableFocusModes[nextIndex] ?? "overview";
    });
  }, [availableFocusModes]);

  const syncTimestampLabel = useMemo(
    () =>
      formatDateTime(
        lastSuccessfulSyncAt ??
          order?.riderTracking?.lastUpdatedAt ??
          rider?.lastKnownLocation?.updatedAt ??
          null
      ),
    [lastSuccessfulSyncAt, order?.riderTracking?.lastUpdatedAt, rider?.lastKnownLocation?.updatedAt]
  );

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

  const openInNativeMaps = useCallback(() => {
    const destination = isPickedUp
      ? customerCoordinate ?? restaurantCoordinate
      : restaurantCoordinate ?? customerCoordinate;

    if (!destination) {
      return;
    }

    const originSegment = riderCoordinate
      ? `&origin=${riderCoordinate.latitude},${riderCoordinate.longitude}`
      : "";
    const url = `https://www.google.com/maps/dir/?api=1${originSegment}&destination=${destination.latitude},${destination.longitude}&travelmode=bicycling`;
    void Linking.openURL(url);
  }, [customerCoordinate, isPickedUp, restaurantCoordinate, riderCoordinate]);

  const clearHoldTimers = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const resetHoldState = useCallback(() => {
    clearHoldTimers();
    holdStartedAtRef.current = null;
    holdCompleteRef.current = null;
    setActiveHoldAction(null);
    setHoldProgress(0);
  }, [clearHoldTimers]);

  useEffect(() => () => resetHoldState(), [resetHoldState]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await orderQuery.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [orderQuery]);

  const scheduleQueueRetry = useCallback((delayMs: number) => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    retryTimeoutRef.current = setTimeout(() => {
      retryTimeoutRef.current = null;
      void flushLocationQueueRef.current();
    }, delayMs);
  }, []);

  const flushLocationQueue = useCallback(async () => {
    if (
      isFlushingQueueRef.current ||
      !orderId ||
      order?.status !== "PickedUp" ||
      !isFocusedLiveTrip ||
      queuedLocationsRef.current.length === 0 ||
      isCompletingDeliveryRef.current
    ) {
      return;
    }

    isFlushingQueueRef.current = true;
    setSyncState("syncing");

    try {
      while (queuedLocationsRef.current.length > 0) {
        const nextPayload = queuedLocationsRef.current[0];
        const updatedOrder = await mutateRiderLocation(nextPayload);
        queuedLocationsRef.current.shift();
        setQueuedLocationCount(queuedLocationsRef.current.length);
        setLastSuccessfulSyncAt(updatedOrder.riderTracking?.lastUpdatedAt ?? new Date().toISOString());
        retryAttemptRef.current = 0;
      }

      setSyncState("live");
    } catch (error) {
      retryAttemptRef.current += 1;
      setSyncState("offline");
      setTrackingError(
        error instanceof Error ? error.message : copy.orderDetails.trackingWeakConnection
      );
      scheduleQueueRetry(Math.min(30000, 3000 * 2 ** (retryAttemptRef.current - 1)));
    } finally {
      isFlushingQueueRef.current = false;
    }
  }, [
    copy.orderDetails.trackingWeakConnection,
    isFocusedLiveTrip,
    mutateRiderLocation,
    order?.status,
    orderId,
    scheduleQueueRetry,
  ]);

  useEffect(() => {
    flushLocationQueueRef.current = flushLocationQueue;
  }, [flushLocationQueue]);

  const enqueueLocationUpdate = useCallback(
    (payload: RiderLocationPayload) => {
      queuedLocationsRef.current.push(payload);
      if (queuedLocationsRef.current.length > MAX_QUEUED_LOCATION_UPDATES) {
        queuedLocationsRef.current.splice(
          0,
          queuedLocationsRef.current.length - MAX_QUEUED_LOCATION_UPDATES,
        );
      }
      setQueuedLocationCount(queuedLocationsRef.current.length);
      setSyncState(queuedLocationsRef.current.length > 1 ? "offline" : "syncing");
      void flushLocationQueue();
    },
    [flushLocationQueue]
  );

  useEffect(() => {
    if (order?.status !== "PickedUp" || !isFocusedLiveTrip || !orderId) {
      return;
    }

    let subscription: Location.LocationSubscription | null = null;
    let isMounted = true;

    const startWatching = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        if (isMounted) {
          setTrackingError(copy.orderDetails.trackingPermissionError);
        }
        return;
      }

      try {
        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (isMounted && !isCompletingDeliveryRef.current) {
          lastLocationSentAtRef.current = Date.now();
          enqueueLocationUpdate(getRiderLocationPayload(currentPosition));
        }
      } catch {
        if (isMounted) {
          setTrackingError(copy.orderDetails.trackingWaitingFirstLocation);
        }
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: trackingPolicy.updateIntervalSeconds * 1000,
          distanceInterval: trackingPolicy.distanceIntervalMeters,
        },
        (position) => {
          if (isCompletingDeliveryRef.current || isLocationMutationPendingRef.current) {
            return;
          }

          const now = Date.now();
          if (now - lastLocationSentAtRef.current < trackingPolicy.updateIntervalSeconds * 1000) {
            return;
          }

          lastLocationSentAtRef.current = now;
          enqueueLocationUpdate(getRiderLocationPayload(position));
        }
      );
    };

    startWatching().catch(() => {
      if (isMounted) {
        setTrackingError(copy.orderDetails.trackingStartError);
      }
    });

    return () => {
      isMounted = false;
      subscription?.remove();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [
    copy.orderDetails.trackingPermissionError,
    copy.orderDetails.trackingStartError,
    copy.orderDetails.trackingWaitingFirstLocation,
    enqueueLocationUpdate,
    isFocusedLiveTrip,
    order?.status,
    orderId,
    trackingPolicy.distanceIntervalMeters,
    trackingPolicy.updateIntervalSeconds,
  ]);

  useEffect(() => {
    const shouldTrackInBackground =
      backgroundTrackingStatus === "PickedUp" &&
      Boolean(orderId) &&
      backgroundTrackingEnabled;

    if (!shouldTrackInBackground || !orderId) {
      if (
        backgroundTrackingStatus &&
        (backgroundTrackingStatus !== "PickedUp" || !backgroundTrackingEnabled)
      ) {
        void stopRiderBackgroundLocationAsync();
      }
      return;
    }

    void setRiderBackgroundTrackingOrderId(null);
    void startRiderBackgroundLocationAsync({
      timeIntervalMs: trackingPolicy.updateIntervalSeconds * 1000,
      distanceIntervalMeters: trackingPolicy.distanceIntervalMeters,
      notificationBody: "Foodbela is sharing your live delivery location.",
    });
  }, [
    backgroundTrackingEnabled,
    backgroundTrackingStatus,
    orderId,
    trackingPolicy.distanceIntervalMeters,
    trackingPolicy.updateIntervalSeconds,
  ]);

  useEffect(() => {
    if (order?.status !== "PickedUp" || !isFocusedLiveTrip) {
      queuedLocationsRef.current = [];
      setQueuedLocationCount(0);
      setSyncState("live");
      retryAttemptRef.current = 0;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    }
  }, [isFocusedLiveTrip, order?.status]);

  const handleAccept = async () => {
    if (!order) return;
    if (!isNetworkOnline) {
      Alert.alert(copy.common.offline, reconnectAcceptLabel);
      return;
    }
    if (isAssignmentsPaused) {
      Alert.alert(pausedAssignmentsLabel, offlineAcceptWarning);
      return;
    }

    try {
      await acceptMutation.mutateAsync(order.id);
    } catch (error) {
      Alert.alert(
        copy.orderDetails.acceptFailed,
        error instanceof Error ? error.message : copy.orderDetails.acceptFailedText
      );
    }
  };

  const handlePickup = useCallback(async () => {
    if (!isNetworkOnline) {
      Alert.alert(copy.common.offline, reconnectDeliveryLabel);
      resetHoldState();
      return;
    }

    const permission = await requestRiderForegroundPermission();
    if (permission.status !== "granted") {
      resetHoldState();
      Alert.alert(
        copy.profile.locationPermissionTitle,
        copy.profile.locationPermissionText,
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Settings",
            onPress: () => {
              void openRiderLocationSettings();
            },
          },
        ],
      );
      return;
    }

    let pickupLocationPayload: RiderLocationPayload;
    try {
      pickupLocationPayload = await getBestAvailableRiderLocationPayload();
    } catch {
      resetHoldState();
      Alert.alert(
        copy.profile.locationPermissionTitle,
        "We could not read this device location. Please turn on GPS and try again.",
        [
          { text: "Try again", style: "cancel" },
          {
            text: "Settings",
            onPress: () => {
              void openRiderLocationSettings();
            },
          },
        ],
      );
      return;
    }

    try {
      const pickedUpOrder = await pickupMutation.mutateAsync(order!.id);
      resetHoldState();

      if (pickedUpOrder.status === "PickedUp") {
        lastLocationSentAtRef.current = Date.now();

        try {
          const updatedOrder = await mutateRiderLocation(pickupLocationPayload);
          setLastSuccessfulSyncAt(
            updatedOrder.riderTracking?.lastUpdatedAt ?? new Date().toISOString(),
          );
          setSyncState("live");
          setTrackingError("");
        } catch {
          enqueueLocationUpdate(pickupLocationPayload);
          setTrackingError(copy.orderDetails.pickupSavedWaiting);
        }

        void startRiderBackgroundLocationAsync({
          timeIntervalMs: trackingPolicy.updateIntervalSeconds * 1000,
          distanceIntervalMeters: trackingPolicy.distanceIntervalMeters,
          notificationBody: "Foodbela is sharing your live delivery location.",
        });
      }
    } catch (error) {
      resetHoldState();
      Alert.alert(
        copy.orderDetails.pickupFailed,
        error instanceof Error ? error.message : copy.orderDetails.pickupFailedText
      );
    }
  }, [
    copy.common.offline,
    copy.orderDetails.pickupFailed,
    copy.orderDetails.pickupFailedText,
    copy.orderDetails.pickupSavedWaiting,
    copy.profile.locationPermissionText,
    copy.profile.locationPermissionTitle,
    reconnectDeliveryLabel,
    enqueueLocationUpdate,
    isNetworkOnline,
    mutateRiderLocation,
    order,
    pickupMutation,
    resetHoldState,
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
      resetHoldState();
      Alert.alert(
        copy.orderDetails.deliverFailed,
        error instanceof Error ? error.message : copy.orderDetails.deliverFailedText
      );
    }
  }, [
    copy.orderDetails.deliverFailed,
    copy.orderDetails.deliverFailedText,
    deliverMutation,
    order,
    resetHoldState,
  ]);

  const handleDeliver = useCallback(async () => {
    if (!order) return;
    if (!isNetworkOnline) {
      Alert.alert(copy.common.offline, reconnectDeliveryLabel);
      resetHoldState();
      return;
    }

    if (order.riderTracking?.isNearCustomer === false) {
      resetHoldState();
      Alert.alert(
        "Confirm customer location",
        "You do not look close to the customer yet. Mark delivered only if the order is handed over.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Mark delivered",
            style: "destructive",
            onPress: () => {
              void completeDelivery();
            },
          },
        ]
      );
      return;
    }

    await completeDelivery();
  }, [
    copy.common.offline,
    completeDelivery,
    reconnectDeliveryLabel,
    isNetworkOnline,
    order,
    resetHoldState,
  ]);

  const handleActivateTracking = async () => {
    if (!isNetworkOnline) {
      Alert.alert(copy.common.offline, reconnectTrackingLabel);
      return;
    }

    try {
      await activateTrackingMutation.mutateAsync(order!.id);
    } catch (error) {
      Alert.alert(
        copy.orderDetails.trackingSwitchFailed,
        error instanceof Error ? error.message : copy.orderDetails.trackingSwitchFailedText
      );
    }
  };

  const startHoldAction = useCallback(
    (action: "pickup" | "deliver", onComplete: () => void) => {
      const isBusy =
        action === "pickup"
          ? pickupMutation.isPending || activeHoldAction !== null
          : deliverMutation.isPending || activeHoldAction !== null;

      if (isBusy) return;

      setActiveHoldAction(action);
      setHoldProgress(0);
      holdStartedAtRef.current = Date.now();
      holdCompleteRef.current = onComplete;

      holdIntervalRef.current = setInterval(() => {
        if (!holdStartedAtRef.current) return;
        const nextProgress = Math.min(1, (Date.now() - holdStartedAtRef.current) / HOLD_DURATION_MS);
        setHoldProgress(nextProgress);
      }, 16);

      holdTimeoutRef.current = setTimeout(() => {
        clearHoldTimers();
        setHoldProgress(1);
        const complete = holdCompleteRef.current;
        holdCompleteRef.current = null;
        complete?.();
      }, HOLD_DURATION_MS);
    },
    [activeHoldAction, clearHoldTimers, deliverMutation.isPending, pickupMutation.isPending]
  );

  const startPickupHold = useCallback(() => {
    startHoldAction("pickup", () => {
      void handlePickup();
    });
  }, [handlePickup, startHoldAction]);

  const startDeliverHold = useCallback(() => {
    startHoldAction("deliver", () => {
      void handleDeliver();
    });
  }, [handleDeliver, startHoldAction]);

  const cancelHoldAction = useCallback(() => {
    if (pickupMutation.isPending || deliverMutation.isPending || activeHoldAction === null) return;
    const heldMs = holdStartedAtRef.current ? Date.now() - holdStartedAtRef.current : 0;
    if (heldMs >= HOLD_DURATION_MS * 0.82 && holdCompleteRef.current) {
      clearHoldTimers();
      setHoldProgress(1);
      const complete = holdCompleteRef.current;
      holdCompleteRef.current = null;
      complete();
      return;
    }
    resetHoldState();
  }, [activeHoldAction, clearHoldTimers, deliverMutation.isPending, pickupMutation.isPending, resetHoldState]);

  const handleBackPress = useCallback(() => {
    const canGoBack =
      (router as unknown as { canGoBack?: () => boolean }).canGoBack?.() ?? false;

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
          params: {
            redirectTo: orderId ? `/orders/${orderId}` : "/(app)/available",
          },
        }}
      />
    );
  }

  const isOrderLoading =
    Boolean(orderId) &&
    !order &&
    (orderQuery.isLoading || orderQuery.isFetching || !orderQuery.isError);

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
            onPress={() => {
              void orderQuery.refetch();
            }}
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
  const orderTimingInfo = getOrderTimingInfo(order);
  const orderTotalLabel = formatMoney(order.pricing?.total);
  const paymentMethodLabel = formatPaymentMethod(order.paymentMethod);
  const paymentBadge = getPaymentMethodBadge(order.paymentMethod);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        scrollEnabled={activeHoldAction === null}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={palette.primaryStrong}
          />
        }
      >
        <View style={styles.topRow}>
          <View style={styles.topIdentityRow}>
            <Pressable style={styles.backButton} onPress={handleBackPress}>
              <Ionicons name="arrow-back" size={20} color={palette.foreground} />
            </Pressable>
            <View style={styles.orderHeadingWrap}>
              <Text style={styles.topOrderId}>{order.orderNumber}</Text>
              <View
                style={[
                  styles.orderStatusPill,
                  {
                    backgroundColor: orderStatusBadge.backgroundColor,
                    borderColor: orderStatusBadge.borderColor,
                  },
                ]}
              >
                <Text style={[styles.orderStatusPillText, { color: orderStatusBadge.color }]}>
                  {orderStatusBadge.label}
                </Text>
              </View>
              <Text style={styles.topOrderTime} numberOfLines={1}>
                {orderTimingInfo.label}: {formatDateTime(orderTimingInfo.value)}
                {orderTimingInfo.value ? ` - ${formatRelativeTime(orderTimingInfo.value)}` : ""}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.topStatusBadge,
              !isNetworkOnline || isAssignmentsPaused
                ? styles.topStatusBadgeOffline
                : styles.topStatusBadgeOnline,
            ]}
          >
            <Text
              style={[
                styles.topStatusBadgeText,
                !isNetworkOnline || isAssignmentsPaused
                  ? styles.topStatusBadgeTextOffline
                  : styles.topStatusBadgeTextOnline,
              ]}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        <View style={styles.dualCardRow}>
          <View style={[styles.infoCardHalf, styles.infoCardRestaurant]}>
            <View style={styles.infoHeaderRow}>
              <View style={styles.infoHeaderMain}>
                <View style={[styles.infoIcon, styles.infoIconRestaurant]}>
                  <Ionicons name="storefront-outline" size={18} color={palette.foreground} />
                </View>
                <Text style={styles.infoSectionLabel} numberOfLines={1}>
                  {copy.orderDetails.restaurantTitle}
                </Text>
              </View>
              {order.restaurant?.phone ? (
                <Pressable
                  style={styles.cardActionButton}
                  onPress={() => Linking.openURL(`tel:${order.restaurant?.phone}`)}
                >
                  <Ionicons name="call" size={15} color={palette.foreground} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.infoTitle} numberOfLines={1}>
              {order.restaurant?.name ?? copy.common.restaurant}
            </Text>
            <Text style={styles.infoText} numberOfLines={2}>
              {order.restaurant?.address ?? "--"}
            </Text>
            <Text style={styles.infoText} numberOfLines={1}>
              {order.restaurant?.phone ?? "--"}
            </Text>
          </View>

          <View style={[styles.infoCardHalf, styles.infoCardCustomer]}>
            <View style={styles.infoHeaderRow}>
              <View style={styles.infoHeaderMain}>
                <View style={[styles.infoIcon, styles.infoIconCustomer]}>
                  <Ionicons name="person-outline" size={18} color={palette.foreground} />
                </View>
                <Text style={styles.infoSectionLabel} numberOfLines={1}>
                  {copy.orderDetails.customerTitle}
                </Text>
              </View>
              {order.customer?.phone ? (
                <Pressable
                  style={styles.cardActionButton}
                  onPress={() => Linking.openURL(`tel:${order.customer?.phone}`)}
                >
                  <Ionicons name="call" size={15} color={palette.foreground} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.infoTitle} numberOfLines={1}>
              {order.customer?.name ?? copy.common.customer}
            </Text>
            <Text style={styles.infoText} numberOfLines={2}>
              {order.customer?.deliveryAddress?.addressLine ??
                order.customer?.deliveryAddress?.label ??
                "--"}
            </Text>
            {order.customer?.deliveryAddress?.addressDetails ? (
              <Text style={styles.infoText} numberOfLines={2}>
                {order.customer.deliveryAddress.addressDetails}
              </Text>
            ) : null}
            <Text style={styles.infoText} numberOfLines={1}>
              {order.customer?.phone ?? "--"}
            </Text>
          </View>
        </View>

        <View style={styles.mapCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{detailCopy.routeSummary}</Text>
            <Text style={styles.sectionBadge}>{detailCopy.etaLabel} • {formatEtaLabel(displayedEtaMinutes)}</Text>
          </View>

          {activeMapRegion ? (
            <View style={styles.mapShell}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={activeMapRegion}
                minZoomLevel={13}
                maxZoomLevel={19}
                scrollEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                zoomEnabled={false}
                toolbarEnabled={false}
                showsUserLocation
                showsCompass={false}
                onMapReady={() => {
                  mapReadyRef.current = true;
                  mapRef.current?.animateToRegion(activeMapRegion, 1);
                }}
              >
                {restaurantCoordinate ? (
                  <Marker
                    key={`restaurant-${restaurantCoordinate.latitude}-${restaurantCoordinate.longitude}`}
                    identifier="restaurant"
                    title={order.restaurant?.name ?? copy.common.restaurant}
                    coordinate={restaurantCoordinate}
                    anchor={{ x: 0.5, y: 0.9 }}
                    zIndex={3}
                  >
                    <RouteMarkerBadge
                      icon="storefront"
                      tone="restaurant"
                    />
                  </Marker>
                ) : null}

                {customerCoordinate ? (
                  <Marker
                    key={`customer-${customerCoordinate.latitude}-${customerCoordinate.longitude}`}
                    identifier="customer"
                    title={order.customer?.name ?? copy.common.customer}
                    coordinate={customerCoordinate}
                    anchor={{ x: 0.5, y: 0.9 }}
                    zIndex={4}
                  >
                    <RouteMarkerBadge
                      icon="home"
                      tone="customer"
                    />
                  </Marker>
                ) : null}

                {plannedDeliveryRoute.length > 1 ? (
                  <Polyline
                    coordinates={plannedDeliveryRoute}
                    strokeColor={palette.amber}
                    strokeWidth={3}
                    lineDashPattern={[8, 8]}
                    zIndex={1}
                  />
                ) : null}

                {activePrimaryRoute.length > 1 ? (
                  <Polyline
                    coordinates={activePrimaryRoute}
                    strokeColor={palette.secondary}
                    strokeWidth={5}
                    lineDashPattern={[10, 8]}
                    zIndex={3}
                  />
                ) : null}
              </MapView>

              <View style={styles.mapActionDock}>
                <Pressable style={styles.mapUtilityButton} onPress={cycleMapFocus}>
                  <Ionicons name={focusModeMeta.icon} size={15} color="#fff" />
                  <Text style={styles.mapUtilityButtonText}>{focusModeMeta.label}</Text>
                </Pressable>
                <Pressable style={styles.mapUtilityButton} onPress={openInNativeMaps}>
                  <Ionicons name="navigate" size={15} color="#fff" />
                  <Text style={styles.mapUtilityButtonText}>{detailCopy.openInMaps}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.mapLegendRow}>
            {activePrimaryRoute.length > 1 ? (
              <View style={styles.legendChip}>
                <View style={styles.legendPrimaryLine} />
                <Text style={styles.legendText} numberOfLines={1}>
                  {isPickedUp ? "Now: rider to customer" : "Now: rider to restaurant"}
                </Text>
              </View>
            ) : null}
            {!isPickedUp && plannedDeliveryRoute.length > 1 ? (
              <View style={styles.legendChip}>
                <View style={styles.legendSecondaryLine} />
                <Text style={styles.legendText} numberOfLines={1}>
                  After pickup: restaurant to customer
                </Text>
              </View>
            ) : null}
            {!activePrimaryRoute.length && isPickedUp ? (
              <View style={styles.legendChip}>
                <View style={styles.legendSecondaryLine} />
                <Text style={styles.legendText} numberOfLines={1}>
                  Waiting for rider GPS
                </Text>
              </View>
            ) : null}
            {!activePrimaryRoute.length && !plannedDeliveryRoute.length && !isPickedUp ? (
              <View style={styles.legendChip}>
                <View style={styles.legendSecondaryLine} />
                <Text style={styles.legendText} numberOfLines={1}>
                  Waiting for route locations
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metricsRow}>
            <View style={[styles.metricCard, styles.metricRose]}>
              <Text style={styles.metricLabel}>{activeLegLabel}</Text>
              <Text style={styles.metricValue}>{formatDistanceLabel(currentLegDistanceKm)}</Text>
            </View>
            <View style={[styles.metricCard, styles.metricSky]}>
              <Text style={styles.metricLabel}>ETA</Text>
              <Text style={styles.metricValue}>{formatEtaLabel(displayedEtaMinutes)}</Text>
            </View>
            <View style={[styles.metricCard, styles.metricAmber]}>
              <Text style={styles.metricLabel}>Sync</Text>
              <View style={styles.syncSignalWrap}>
                <View
                  style={[
                    styles.syncSignalDot,
                    syncState === "live"
                      ? styles.syncSignalLive
                      : syncState === "syncing"
                        ? styles.syncSignalSyncing
                        : styles.syncSignalOffline,
                  ]}
                />
              </View>
            </View>
          </View>

          {shouldShowTripSyncStatus && (syncState !== "live" || Boolean(trackingError) || queuedLocationCount > 0) ? (
            <View style={styles.syncCard}>
              <View style={styles.syncHeaderRow}>
                <Text style={styles.syncTitle}>{detailCopy.currentSync}</Text>
                <View
                  style={[
                    styles.syncStateBadge,
                    syncState === "live"
                      ? styles.syncStateBadgeLive
                      : syncState === "syncing"
                        ? styles.syncStateBadgeSyncing
                        : styles.syncStateBadgeOffline,
                  ]}
                >
                  <Text
                    style={[
                      styles.syncStateBadgeText,
                      syncState === "live"
                        ? styles.syncStateBadgeTextLive
                        : syncState === "syncing"
                          ? styles.syncStateBadgeTextSyncing
                          : styles.syncStateBadgeTextOffline,
                    ]}
                  >
                    {syncState === "live"
                      ? copy.orderDetails.syncLive
                      : syncState === "syncing"
                        ? copy.orderDetails.syncSyncing
                        : copy.orderDetails.syncOffline}
                  </Text>
                </View>
              </View>
              <Text style={styles.syncText}>
                {syncState === "live"
                  ? copy.orderDetails.lastSync(syncTimestampLabel)
                  : syncState === "syncing"
                    ? copy.orderDetails.queuedWaiting(queuedLocationCount)
                    : copy.orderDetails.queuedRetry(queuedLocationCount)}
              </Text>
              {trackingError ? <Text style={styles.errorText}>{trackingError}</Text> : null}
            </View>
          ) : null}
        </View>

        {!isNetworkOnline || (!riderCoordinate && !isPickedUp) || (isAssignmentsPaused && order.assignmentState === "unassigned") ? (
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={18} color={palette.warningText} />
            <Text style={styles.warningText}>
              {!isNetworkOnline
                ? reconnectTrackingLabel
                : !riderCoordinate && !isPickedUp
                ? copy.orderDetails.riderLocationWarning
                : offlineAcceptWarning}
            </Text>
          </View>
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
                {pickedUpElapsedMinutes ?? 0} min out
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
            {deliveryDelayState.level !== "watch" && (order.customer?.phone || supportPhone) ? (
              <View style={styles.deliveryDelayActions}>
                {order.customer?.phone ? (
                  <Pressable
                    style={[styles.deliveryDelayAction, styles.deliveryDelayActionPrimary]}
                    onPress={() => Linking.openURL(`tel:${order.customer?.phone}`)}
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

        <View style={styles.sectionCard}>
          <View style={styles.cardSectionHeader}>
            <Text style={styles.sectionTitle}>{copy.orderDetails.itemsTitle}</Text>
            <View style={styles.sectionCountBadge}>
              <Text style={styles.sectionCountText}>{itemRows.length}</Text>
            </View>
          </View>
          <View style={styles.orderSummaryStrip}>
            <View style={[styles.orderSummaryBlock, styles.paymentSummaryBlock]}>
              <View style={styles.paymentSummaryHeader}>
                <Ionicons name="wallet" size={14} color={palette.surface} />
                <Text style={[styles.orderSummaryLabel, styles.orderSummaryLabelDark]}>Payment</Text>
              </View>
              <View
                style={[
                  styles.paymentMethodBadge,
                  styles.paymentMethodBadgeDark,
                ]}
              >
                <Ionicons name={paymentBadge.icon} size={14} color={palette.surface} />
                <Text style={[styles.paymentMethodBadgeText, styles.paymentMethodBadgeTextDark]}>
                  {paymentBadge.label}
                </Text>
              </View>
              <Text style={[styles.paymentMethodHint, styles.paymentMethodHintDark]}>
                {paymentMethodLabel}
              </Text>
            </View>
            <View style={styles.orderSummaryDivider} />
            <View style={[styles.orderSummaryBlock, styles.orderSummaryBlockRight]}>
              <Text style={[styles.orderSummaryLabel, styles.orderSummaryLabelDark]}>Total</Text>
              <Text style={styles.orderSummaryTotal}>{orderTotalLabel}</Text>
            </View>
          </View>
          <View style={styles.itemList}>
            {itemRows.map((item: { name?: string; quantity?: number; totalPrice?: number }, index: number) => (
              <View key={`${item.name}-${index}`} style={styles.itemRow}>
                <View style={styles.itemQuantityPill}>
                  <Text style={styles.itemQuantity}>{item.quantity ?? 1}x</Text>
                </View>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                {typeof item.totalPrice === "number" ? (
                  <Text style={styles.itemPrice}>Tk {Math.round(item.totalPrice)}</Text>
                ) : null}
              </View>
            ))}
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
            {timelineRows.map((entry: { status: string; createdAt: string | null }, index: number) => {
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
            })}
          </View>
        </View>

        {isAcceptStep ? (
          <Pressable
            style={[styles.primaryAction, isAcceptDisabled && styles.buttonDisabled]}
            onPress={handleAccept}
            disabled={isAcceptDisabled}
          >
            {acceptMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.primaryActionText}>
                  {!isNetworkOnline ? reconnectActionLabel : copy.orderDetails.acceptOrder}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        {isPickupStep ? (
          <View style={styles.holdShell}>
            <Text style={styles.holdTitle}>{copy.orderDetails.pickUpOrder}</Text>
            <Pressable
              style={[styles.holdButton, isPickupDisabled && styles.buttonDisabled]}
              onPressIn={startPickupHold}
              onPressOut={cancelHoldAction}
              hitSlop={8}
              pressRetentionOffset={{ top: 42, bottom: 42, left: 42, right: 42 }}
              disabled={isPickupDisabled}
            >
              <View style={[styles.holdProgressFill, { width: `${holdProgress * 100}%` }]} />
              <View style={styles.holdButtonContent}>
                {pickupMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="bag-handle-outline" size={18} color="#fff" />
                )}
                <Text style={styles.holdButtonText}>
                  {!isNetworkOnline ? reconnectActionLabel : copy.orderDetails.pickUpOrder}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {order.status === "PickedUp" && !isFocusedLiveTrip ? (
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
                  {!isNetworkOnline ? reconnectActionLabel : copy.orderDetails.makeLiveTrip}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        {order.status === "PickedUp" ? (
          <View style={styles.holdShell}>
            <Text style={styles.holdTitle}>{copy.orderDetails.holdToDeliver}</Text>
            <Pressable
              style={[styles.holdButton, isDeliverDisabled && styles.buttonDisabled]}
              onPressIn={startDeliverHold}
              onPressOut={cancelHoldAction}
              hitSlop={8}
              pressRetentionOffset={{ top: 42, bottom: 42, left: 42, right: 42 }}
              disabled={isDeliverDisabled}
            >
              <View style={[styles.holdProgressFill, { width: `${holdProgress * 100}%` }]} />
              <View style={styles.holdButtonContent}>
                {deliverMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                )}
                <Text style={styles.holdButtonText}>
                  {!isNetworkOnline ? reconnectActionLabel : copy.orderDetails.holdToDeliver}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 14,
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
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  topIdentityRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  orderHeadingWrap: {
    flex: 1,
    gap: 2,
  },
  topOrderId: {
    fontSize: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  orderStatusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
  },
  orderStatusPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  topOrderTime: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.mutedForeground,
  },
  topStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  topStatusBadgeOnline: {
    backgroundColor: palette.successSoft,
    borderColor: "#BFE6D1",
  },
  topStatusBadgeOffline: {
    backgroundColor: "#F4EDE6",
    borderColor: palette.border,
  },
  topStatusBadgeText: {
    fontSize: 12,
    fontWeight: "800",
  },
  topStatusBadgeTextOnline: {
    color: palette.success,
  },
  topStatusBadgeTextOffline: {
    color: palette.mutedForeground,
  },
  mapCard: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: "hidden",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
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
  mapModeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  mapModeTextWrap: {
    gap: 1,
  },
  mapModeLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  mapModeValue: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.primaryStrong,
  },
  mapShell: {
    overflow: "hidden",
  },
  map: {
    height: 372,
  },
  mapMarkerWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
  },
  mapMarkerPin: {
    width: 31,
    height: 31,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  mapMarkerRestaurant: {
    backgroundColor: palette.primary,
  },
  mapMarkerCustomer: {
    backgroundColor: palette.secondary,
  },
  mapMarkerRider: {
    backgroundColor: palette.foreground,
  },
  mapActionDock: {
    position: "absolute",
    right: 12,
    top: 12,
    gap: 8,
    alignItems: "flex-end",
  },
  mapUtilityButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mapUtilityButtonText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  mapLegendRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  legendChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.surfaceMuted,
  },
  legendPrimaryLine: {
    width: 18,
    height: 0,
    borderTopWidth: 4,
    borderStyle: "dashed",
    borderColor: palette.secondary,
  },
  legendSecondaryLine: {
    width: 18,
    height: 0,
    borderTopWidth: 4,
    borderStyle: "dashed",
    borderColor: palette.amber,
  },
  legendText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: palette.foreground,
  },
  perspectiveHint: {
    fontSize: 12,
    color: palette.mutedForeground,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
  },
  metricCard: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  metricRose: {
    backgroundColor: "#FFF0F6",
    borderColor: "#FFCEE0",
  },
  metricSky: {
    backgroundColor: "#FFF9E6",
    borderColor: "#FDE68A",
  },
  metricAmber: {
    backgroundColor: palette.infoSoft,
    borderColor: "#C8D4FF",
  },
  metricLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  syncSignalWrap: {
    height: 20,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  syncSignalDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  syncSignalLive: {
    backgroundColor: palette.success,
  },
  syncSignalSyncing: {
    backgroundColor: palette.amber,
  },
  syncSignalOffline: {
    backgroundColor: palette.danger,
  },
  etaCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    gap: 4,
    backgroundColor: palette.surfaceMuted,
  },
  etaLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  etaValue: {
    fontSize: 20,
    fontWeight: "800",
    color: palette.foreground,
  },
  etaMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: palette.mutedForeground,
  },
  syncCard: {
    marginHorizontal: 16,
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
  syncStateBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  syncStateBadgeLive: {
    backgroundColor: palette.successSurface,
  },
  syncStateBadgeSyncing: {
    backgroundColor: "#EAF1FF",
  },
  syncStateBadgeOffline: {
    backgroundColor: palette.warningSurface,
  },
  syncStateBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  syncStateBadgeTextLive: {
    color: palette.successText,
  },
  syncStateBadgeTextSyncing: {
    color: palette.sky,
  },
  syncStateBadgeTextOffline: {
    color: palette.warningText,
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
  warningCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 18,
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
    borderRadius: 18,
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
  infoCardHalf: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    backgroundColor: palette.surface,
    borderColor: palette.border,
  },
  infoCardRestaurant: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
  },
  infoCardCustomer: {
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
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  infoIconRestaurant: {
    backgroundColor: palette.primarySoft,
  },
  infoIconCustomer: {
    backgroundColor: palette.infoSoft,
  },
  infoTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.foreground,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.mutedForeground,
  },
  cardActionButton: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  infoSectionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    color: palette.foreground,
  },
  sectionCard: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.primary,
  },
  orderSummaryStrip: {
    minHeight: 76,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  orderSummaryBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  paymentSummaryBlock: {
    alignSelf: "stretch",
    borderRadius: 14,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: "center",
    gap: 6,
  },
  paymentSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderSummaryBlockRight: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  orderSummaryDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  orderSummaryLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  orderSummaryLabelDark: {
    color: "rgba(255,255,255,0.7)",
  },
  orderSummaryValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.foreground,
  },
  paymentMethodBadge: {
    alignSelf: "flex-start",
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  paymentMethodBadgeDark: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  paymentMethodBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  paymentMethodBadgeTextDark: {
    color: palette.surface,
  },
  paymentMethodHint: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  paymentMethodHintDark: {
    color: "rgba(255,255,255,0.72)",
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
  primaryAction: {
    minHeight: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.primaryStrong,
  },
  primaryActionText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  secondaryAction: {
    minHeight: 56,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.surfaceMuted,
  },
  secondaryActionText: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.primaryStrong,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  holdShell: {
    gap: 12,
    borderRadius: 24,
    padding: 16,
    backgroundColor: palette.primaryStrong,
  },
  holdTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  holdButton: {
    overflow: "hidden",
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  holdProgressFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: palette.secondary,
  },
  holdButtonContent: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  holdButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});
