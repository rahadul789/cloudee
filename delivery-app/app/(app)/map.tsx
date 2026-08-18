import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import * as Location from "expo-location";

import {
  useRiderDeliveryThresholdsQuery,
  useRiderLiveMapQuery,
  useRiderNotificationsQuery,
  useRiderOrderDetailsQuery,
  useRiderOrdersQuery,
  useRiderProfileQuery,
  useUpdateRiderAvailabilityMutation,
  type RiderLiveMapOrder,
  type RiderLiveMapRestaurant,
  type RiderMapCoordinate,
  type RiderOrder,
} from "@/src/hooks/use-rider-api";
import { DeliveryMap, type DeliveryMapHandle, type MapRoute, type MapStop } from "@/src/components/delivery-map";
import { decodePolyline } from "@/src/lib/polyline";
import { HomeOrdersSheet, type SheetContextOrder } from "@/src/components/home-orders-sheet";
import { RiderSidebar } from "@/src/components/rider-sidebar";
import { useDeliveryCopy } from "@/src/lib/copy";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

const SHEET_HEIGHT = Math.min(Dimensions.get("window").height * 0.72, 620);

const STATUS_COLORS: Record<string, string> = {
  Accepted: palette.info,
  Preparing: palette.warning,
  ReadyForPickup: palette.success,
  PickedUp: palette.secondary,
};

type MapCopy = ReturnType<typeof useDeliveryCopy>["copy"]["map"];

function isCoordinate(value?: RiderMapCoordinate | null): value is RiderMapCoordinate {
  return (
    typeof value?.latitude === "number" &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude)
  );
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

// Minutes elapsed since an ISO timestamp (null if missing/invalid). Drives late detection.
function minutesSince(iso?: string | null) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return (Date.now() - time) / 60000;
}

function calculateDistanceKm(from?: RiderMapCoordinate | null, to?: RiderMapCoordinate | null) {
  if (!isCoordinate(from) || !isCoordinate(to)) return null;

  const radiusKm = 6371;
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radiusKm * c;
}

function estimateEtaMinutes(distanceKm: number | null, speedKmph: number, routeFactor: number) {
  if (distanceKm === null) return null;
  const safeSpeed = Math.min(45, Math.max(6, speedKmph));
  const safeRouteFactor = Math.min(2, Math.max(1, routeFactor));
  return Math.max(1, Math.round((distanceKm * safeRouteFactor * 60) / safeSpeed));
}

function formatDistance(distanceKm: number | null, mapCopy: MapCopy) {
  if (distanceKm === null) return "--";
  if (distanceKm < 1) return mapCopy.distanceMeters(Math.max(1, Math.round(distanceKm * 1000)));
  return mapCopy.distanceKm(distanceKm.toFixed(distanceKm < 10 ? 1 : 0));
}

function formatEta(minutes: number | null, mapCopy: MapCopy) {
  if (minutes === null) return "--";
  if (minutes <= 1) return mapCopy.minute;
  return mapCopy.minutes(minutes);
}

function formatRemaining(order: RiderLiveMapOrder | null | undefined, mapCopy: MapCopy) {
  if (!order) return mapCopy.noOrderSelected;
  if (order.status === "ReadyForPickup") return mapCopy.readyNow;
  if (order.status === "PickedUp") return mapCopy.pickedUp;
  const remainingSeconds = order.preparation?.remainingSeconds;
  const lateBySeconds = order.preparation?.lateBySeconds ?? 0;

  if (typeof remainingSeconds !== "number") {
    return order.preparation?.label ?? mapCopy.preparing;
  }

  if (remainingSeconds <= 0) {
    if (lateBySeconds > 0) {
      return mapCopy.minutesLate(Math.max(1, Math.ceil(lateBySeconds / 60)));
    }
    return mapCopy.almostReady;
  }

  return mapCopy.minutesLeft(Math.ceil(remainingSeconds / 60));
}

function getRestaurantState(restaurant: RiderLiveMapRestaurant) {
  if (restaurant.readyCount > 0) return "ReadyForPickup";
  if (restaurant.lateCount > 0) return "Preparing";
  if (restaurant.preparingCount > 0) return "Preparing";
  if (restaurant.pickedUpCount > 0) return "PickedUp";
  return "Accepted";
}

function getStatusLabel(status: string | undefined, mapCopy: MapCopy) {
  if (status === "ReadyForPickup") return mapCopy.statusReady;
  if (status === "PickedUp") return mapCopy.statusPickedUp;
  if (status === "Preparing") return mapCopy.statusPreparing;
  if (status === "Accepted") return mapCopy.statusAccepted;
  return status || mapCopy.statusFallback;
}

function StatusPill({ label, tone }: { label: string; tone: string }) {
  return (
    <View style={[styles.statusPill, { backgroundColor: `${tone}18`, borderColor: `${tone}40` }]}>
      <View style={[styles.statusDot, { backgroundColor: tone }]} />
      <Text style={[styles.statusPillText, { color: tone }]}>{label}</Text>
    </View>
  );
}

function MapActionButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mapButton,
        active ? styles.mapButtonActive : null,
        pressed ? styles.mapButtonPressed : null,
      ]}
    >
      <Ionicons name={icon} size={18} color={active ? palette.secondary : palette.foreground} />
    </Pressable>
  );
}

function InfoCard({
  icon,
  label,
  value,
  tone,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  tone: string;
  subtitle?: string;
}) {
  return (
    <View style={[styles.infoCard, { backgroundColor: `${tone}12`, borderColor: `${tone}35` }]}>
      <View style={[styles.infoIcon, { backgroundColor: tone }]}>
        <Ionicons name={icon} size={15} color={palette.surface} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
      {subtitle ? <Text style={styles.infoSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function RestaurantMapSheet({
  visible,
  restaurant,
  riderLocation,
  speedKmph,
  routeFactor,
  bottomInset,
  mapCopy,
  onClose,
}: {
  visible: boolean;
  restaurant: RiderLiveMapRestaurant | null;
  riderLocation: RiderMapCoordinate | null;
  speedKmph: number;
  routeFactor: number;
  bottomInset: number;
  mapCopy: MapCopy;
  onClose: () => void;
}) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const leadOrder = restaurant?.orders[0] ?? null;
  const tone = restaurant ? STATUS_COLORS[getRestaurantState(restaurant)] ?? palette.foreground : palette.foreground;
  const isLeadPickedUp = leadOrder?.status === "PickedUp";
  const riderToRestaurantDistance = calculateDistanceKm(riderLocation, restaurant?.location);
  const riderToCustomerDistance = calculateDistanceKm(riderLocation, leadOrder?.customer?.location);
  const riderToRestaurantEta = estimateEtaMinutes(
    isLeadPickedUp ? riderToCustomerDistance : riderToRestaurantDistance,
    speedKmph,
    routeFactor
  );

  const closeWithAnimation = useCallback(() => {
    Animated.timing(translateY, {
      toValue: SHEET_HEIGHT,
      duration: 180,
      useNativeDriver: true,
    }).start(onClose);
  }, [onClose, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 70 || gesture.vy > 1.1) {
            closeWithAnimation();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            tension: 90,
            friction: 12,
            useNativeDriver: true,
          }).start();
        },
      }),
    [closeWithAnimation, translateY]
  );

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(SHEET_HEIGHT);
    Animated.spring(translateY, {
      toValue: 0,
      tension: 90,
      friction: 13,
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  const openDirections = async () => {
    const destinationCoordinate =
      isLeadPickedUp && isCoordinate(leadOrder?.customer?.location)
        ? leadOrder.customer.location
        : restaurant?.location;
    if (!isCoordinate(destinationCoordinate)) return;
    const destination = `${destinationCoordinate.latitude},${destinationCoordinate.longitude}`;
    const origin = isCoordinate(riderLocation)
      ? `&origin=${encodeURIComponent(`${riderLocation.latitude},${riderLocation.longitude}`)}`
      : "";
    const url = `https://www.google.com/maps/dir/?api=1${origin}&destination=${encodeURIComponent(destination)}&travelmode=bicycling`;

    await Linking.openURL(url);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeWithAnimation}>
      <Pressable style={styles.sheetBackdrop} onPress={closeWithAnimation} />
      <Animated.View
        style={[
          styles.sheet,
          {
            height: SHEET_HEIGHT,
            paddingBottom: Math.max(18, bottomInset + 12),
            transform: [{ translateY }],
          },
        ]}
      >
        <View {...panResponder.panHandlers} style={styles.sheetHandleArea}>
          <View style={styles.sheetHandle} />
        </View>

        {restaurant ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <View style={[styles.sheetRestaurantIcon, { backgroundColor: tone }]}>
                <Ionicons name="restaurant" size={18} color={palette.surface} />
              </View>
              <View style={styles.sheetTitleBlock}>
                <Text numberOfLines={1} style={styles.sheetTitle}>
                  {restaurant.name}
                </Text>
                <Text numberOfLines={1} style={styles.sheetSubtitle}>
                  {restaurant.address || restaurant.city || mapCopy.restaurantLocation}
                </Text>
              </View>
              <StatusPill label={formatRemaining(leadOrder, mapCopy)} tone={tone} />
            </View>

            {/* Minimal, decision-focused: where to go next + when it's ready. */}
            <View style={styles.infoGrid}>
              <InfoCard
                icon={isLeadPickedUp ? "home" : "navigate"}
                label={isLeadPickedUp ? mapCopy.reachCustomer : mapCopy.reachRestaurant}
                value={formatEta(riderToRestaurantEta, mapCopy)}
                subtitle={formatDistance(isLeadPickedUp ? riderToCustomerDistance : riderToRestaurantDistance, mapCopy)}
                tone={palette.secondary}
              />
              <InfoCard
                icon="timer"
                label={mapCopy.nextReady}
                value={formatRemaining(leadOrder, mapCopy)}
                subtitle={
                  restaurant.lateCount
                    ? mapCopy.lateCount(restaurant.lateCount)
                    : mapCopy.readyCount(restaurant.readyCount)
                }
                tone={restaurant.lateCount ? palette.danger : palette.warning}
              />
            </View>

            <View style={styles.sheetSectionHeader}>
              <Text style={styles.sheetSectionTitle}>{mapCopy.orderStates}</Text>
              <Text style={styles.sheetSectionMeta}>{mapCopy.switchRestaurantHint}</Text>
            </View>
            <View style={styles.ordersList}>
              {restaurant.orders.map((order) => {
                const orderTone = STATUS_COLORS[order.status] ?? palette.foreground;
                const isReadyOrder = order.status === "ReadyForPickup";
                return (
                  <Pressable
                    key={order.id}
                    accessibilityRole={isReadyOrder ? "button" : undefined}
                    disabled={!isReadyOrder}
                    onPress={() => router.push(`/orders/${order.id}`)}
                    style={({ pressed }) => [
                      styles.orderRow,
                      isReadyOrder ? styles.orderRowReady : null,
                      pressed ? styles.mapButtonPressed : null,
                    ]}
                  >
                    <View style={[styles.orderStateIcon, { backgroundColor: `${orderTone}18` }]}>
                      <Ionicons
                        name={order.status === "ReadyForPickup" ? "checkmark-done" : "time"}
                        size={15}
                        color={orderTone}
                      />
                    </View>
                    <View style={styles.orderRowBody}>
                      <Text style={styles.orderRowTitle}>{order.orderNumber}</Text>
                      <Text style={styles.orderRowMeta}>{formatRemaining(order, mapCopy)}</Text>
                    </View>
                    <View style={[styles.orderStatusBadge, { backgroundColor: `${orderTone}15`, borderColor: `${orderTone}45` }]}>
                      <Text style={[styles.orderStatusText, { color: orderTone }]}>
                        {getStatusLabel(order.status, mapCopy)}
                      </Text>
                    </View>
                    {isReadyOrder ? (
                      <Ionicons name="chevron-forward" size={16} color={palette.success} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sheetActions}>
              {leadOrder ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/orders/${leadOrder.id}`)}
                  style={({ pressed }) => [
                    styles.sheetSecondaryAction,
                    pressed ? styles.primaryActionPressed : null,
                  ]}
                >
                  <Ionicons name="reader-outline" size={17} color={palette.foreground} />
                  <Text style={styles.sheetSecondaryText}>Details</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={openDirections}
                disabled={!isCoordinate(restaurant.location)}
                style={({ pressed }) => [styles.sheetPrimaryAction, pressed ? styles.primaryActionPressed : null]}
              >
                <Text style={styles.sheetPrimaryText}>{mapCopy.openDirections}</Text>
                <Ionicons name="navigate" size={17} color={palette.surface} />
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

export default function RiderMapScreen() {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { copy } = useDeliveryCopy();
  const mapCopy = copy.map;
  const rider = useRiderAuthStore((state) => state.rider);
  const liveMapQuery = useRiderLiveMapQuery(isFocused);
  const thresholdsQuery = useRiderDeliveryThresholdsQuery();
  const activeOrdersQuery = useRiderOrdersQuery("active");
  // The real road route (polyline) is only computed by the order-DETAILS endpoint, not the
  // list — so to draw the live order's road path on the home map we fetch its details.
  const liveOrderId = liveMapQuery.data?.rider.activeTrackingOrderId ?? "";
  const liveOrderDetailsQuery = useRiderOrderDetailsQuery(liveOrderId || undefined);
  const notificationsSummary = useRiderNotificationsQuery(isFocused);
  const hasUnreadNotifications = (notificationsSummary.data?.unreadCount ?? 0) > 0;
  // Assigned orders keyed by id, so a map pin can look up its order's timestamps to detect
  // late pickup / late delivery against the admin thresholds.
  const activeById = useMemo(() => {
    const map = new Map<string, RiderOrder>();
    (activeOrdersQuery.data ?? []).forEach((order) => map.set(order.id, order));
    return map;
  }, [activeOrdersQuery.data]);
  const pickupLateGraceMinutes = thresholdsQuery.data?.pickupLateGraceMinutes ?? 10;
  const deliveryLateMinutes = thresholdsQuery.data?.deliveryLateAfterPickupMinutes ?? 25;
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  // Bumped on every marker tap so the sheet re-expands even when the same pin is tapped
  // again after the rider manually collapsed it (selectedOrderId alone wouldn't change).
  const [expandSignal, setExpandSignal] = useState(0);
  // A deep-link / notification / list tap arrives here as ?orderId= (the retired
  // order-details route redirects to this screen). Open that order in the sheet.
  const params = useLocalSearchParams<{ orderId?: string }>();
  useEffect(() => {
    if (params.orderId) {
      setSelectedOrderId(params.orderId);
      setExpandSignal((n) => n + 1);
      // Consume the param so it can't re-select after the rider backs out (and so the same
      // notification tapped again still re-fires).
      router.setParams({ orderId: "" });
    }
  }, [params.orderId]);
  const activeTrackingOrderId = liveMapQuery.data?.rider.activeTrackingOrderId ?? "";
  const restaurants = useMemo(() => {
    const list = liveMapQuery.data?.restaurants ?? [];
    return readyOnly ? list.filter((restaurant) => restaurant.readyCount > 0) : list;
  }, [liveMapQuery.data?.restaurants, readyOnly]);
  const selectedRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) ?? null,
    [restaurants, selectedRestaurantId]
  );
  const riderLocationFromProfile = rider?.lastKnownLocation;
  const riderLocation = useMemo(() => {
    const liveLocation = liveMapQuery.data?.rider.location;
    if (isCoordinate(liveLocation)) return liveLocation;
    if (
      typeof riderLocationFromProfile?.latitude === "number" &&
      typeof riderLocationFromProfile.longitude === "number"
    ) {
      return {
        latitude: riderLocationFromProfile.latitude,
        longitude: riderLocationFromProfile.longitude,
      };
    }
    return null;
  }, [
    liveMapQuery.data?.rider.location,
    riderLocationFromProfile?.latitude,
    riderLocationFromProfile?.longitude,
  ]);
  // Restaurants ordered by "where to head next": picked-up drop-offs first, then priority /
  // ready / late count, closer wins. Drives both the list order and the suggested strip.
  const sortedRestaurants = useMemo(() => {
    return [...restaurants].sort((left, right) => {
      const leftPickedUpOrder = left.orders.find((order) => order.status === "PickedUp" && isCoordinate(order.customer?.location));
      const rightPickedUpOrder = right.orders.find((order) => order.status === "PickedUp" && isCoordinate(order.customer?.location));
      const leftDistance =
        calculateDistanceKm(riderLocation, leftPickedUpOrder?.customer?.location ?? left.location) ?? 99;
      const rightDistance =
        calculateDistanceKm(riderLocation, rightPickedUpOrder?.customer?.location ?? right.location) ?? 99;
      const leftScore =
        (leftPickedUpOrder ? 250 : 0) +
        Number(left.priority ?? 0) +
        left.readyCount * 25 +
        left.lateCount * 18 -
        leftDistance * 2;
      const rightScore =
        (rightPickedUpOrder ? 250 : 0) +
        Number(right.priority ?? 0) +
        right.readyCount * 25 +
        right.lateCount * 18 -
        rightDistance * 2;

      return rightScore - leftScore;
    });
  }, [restaurants, riderLocation]);
  const suggestedRestaurant = sortedRestaurants[0] ?? null;
  const speedKmph = thresholdsQuery.data?.riderEtaSpeedKmph ?? 24;
  const routeFactor = thresholdsQuery.data?.riderEtaRouteFactor ?? 1.1;
  const stripRestaurant = suggestedRestaurant;
  const stripPickedUpOrder = stripRestaurant?.orders.find(
    (order) => order.status === "PickedUp" && isCoordinate(order.customer?.location)
  ) ?? null;
  const stripDistance = calculateDistanceKm(
    riderLocation,
    stripPickedUpOrder?.customer?.location ?? stripRestaurant?.location
  );
  const stripOrder = stripRestaurant?.orders[0] ?? null;

  // Build the map pins so the rider clearly sees WHERE to go:
  //  • Restaurant (pickup) pin only while it still has orders to collect — the count badge
  //    shows how many are pending pickup, and DROPS the once an order is picked up.
  //  • Customer (drop) pin for each picked-up order — head there to deliver.
  const mapStops = useMemo<MapStop[]>(() => {
    const result: MapStop[] = [];
    sortedRestaurants.forEach((restaurant) => {
      const focused =
        restaurant.id === (selectedRestaurantId || suggestedRestaurant?.id);
      const pendingPickup = restaurant.orders.filter(
        (order) => order.status !== "PickedUp",
      ).length;
      const pickupLoc = restaurant.location;
      if (pendingPickup > 0 && isCoordinate(pickupLoc)) {
        // Ring color = most-advanced pending state so the rider reads it at a glance:
        // green = ready to grab, amber = still cooking, blue = accepted.
        const pickupStatus =
          restaurant.readyCount > 0
            ? "ReadyForPickup"
            : restaurant.preparingCount > 0 || restaurant.lateCount > 0
              ? "Preparing"
              : "Accepted";
        // A cooking order under 5 min from ready → amber "prep" heads-up (not an alarm).
        const nearlyReady = restaurant.orders.some(
          (order) =>
            (order.status === "Accepted" || order.status === "Preparing") &&
            typeof order.preparation?.remainingSeconds === "number" &&
            order.preparation.remainingSeconds < 300,
        );
        // A ready order sitting past the grace period → red "late" alert (act now). Track the
        // WORST overrun at this restaurant so the pin can show how many minutes late it is.
        let pickupLateMinutes = 0;
        restaurant.orders.forEach((order) => {
          const active = activeById.get(order.id);
          if (active?.status === "ReadyForPickup") {
            const over =
              (minutesSince(active.timestamps?.ReadyForPickup) ?? 0) - pickupLateGraceMinutes;
            if (over > pickupLateMinutes) pickupLateMinutes = over;
          }
        });
        const pickupLate = pickupLateMinutes > 0;
        result.push({
          id: `pickup:${restaurant.id}`,
          kind: "pickup",
          latitude: pickupLoc.latitude,
          longitude: pickupLoc.longitude,
          label: restaurant.name,
          count: pendingPickup,
          statusColor: STATUS_COLORS[pickupStatus],
          alert: pickupLate ? "late" : nearlyReady ? "prep" : undefined,
          alertMinutes: pickupLate ? Math.max(1, Math.round(pickupLateMinutes)) : undefined,
          focused,
        });
      }
      restaurant.orders.forEach((order) => {
        const dropLoc = order.customer?.location;
        if (order.status === "PickedUp" && isCoordinate(dropLoc)) {
          const activeDrop = activeById.get(order.id);
          const deliveryOver =
            activeDrop?.status === "PickedUp"
              ? (minutesSince(activeDrop.timestamps?.PickedUp) ?? 0) - deliveryLateMinutes
              : 0;
          const deliveryLate = deliveryOver > 0;
          result.push({
            id: `drop:${order.id}:${restaurant.id}`,
            kind: "drop",
            latitude: dropLoc.latitude,
            longitude: dropLoc.longitude,
            label: order.customer?.name || order.orderNumber,
            statusColor: STATUS_COLORS.PickedUp,
            live: Boolean(activeTrackingOrderId) && order.id === activeTrackingOrderId,
            alert: deliveryLate ? "late" : undefined,
            alertMinutes: deliveryLate ? Math.max(1, Math.round(deliveryOver)) : undefined,
            focused,
          });
        }
      });
    });
    return result;
  }, [
    sortedRestaurants,
    selectedRestaurantId,
    suggestedRestaurant?.id,
    activeTrackingOrderId,
    activeById,
    pickupLateGraceMinutes,
    deliveryLateMinutes,
  ]);

  // Every active leg drawn at once so the rider sees all their orders on the home map (no
  // need to open the details screen): the order sharing live location is a SOLID full-colour
  // road route, the rest are DASHED + faded. A leg with no real road polyline falls back to
  // a dashed straight line rider → destination (always dashed, since it's only an estimate).
  // ONLY the live-tracking order's path is drawn (solid road route). Other active orders are
  // intentionally left off the map so the live leg is unambiguous.
  const liveOrderDetails = liveOrderDetailsQuery.data;
  const mapRoutes = useMemo<MapRoute[]>(() => {
    if (!liveOrderId) return [];
    const decoded = decodePolyline(liveOrderDetails?.routeToNext?.polyline);
    if (decoded.length > 1) {
      return [{ key: liveOrderId, coords: decoded, dashed: false }];
    }
    // No road polyline yet → a solid straight line rider → destination as a stand-in.
    const riderLoc = liveMapQuery.data?.rider.location ?? riderLocation;
    const pickedUp = liveOrderDetails?.status === "PickedUp";
    const dest = pickedUp
      ? liveOrderDetails?.customer?.deliveryAddress
      : liveOrderDetails?.restaurant;
    if (
      dest &&
      typeof dest.latitude === "number" &&
      typeof dest.longitude === "number" &&
      riderLoc &&
      isCoordinate(riderLoc)
    ) {
      return [
        {
          key: liveOrderId,
          coords: [
            { latitude: riderLoc.latitude, longitude: riderLoc.longitude },
            { latitude: dest.latitude, longitude: dest.longitude },
          ],
          dashed: false,
        },
      ];
    }
    return [];
  }, [liveOrderId, liveOrderDetails, liveMapQuery.data?.rider.location, riderLocation]);

  // Live-map orders as sheet "context" — so tapping a pin whose order isn't an actionable
  // task yet (e.g. still cooking) still shows useful info (prep countdown, amount).
  const contextOrders = useMemo<SheetContextOrder[]>(() => {
    const out: SheetContextOrder[] = [];
    (liveMapQuery.data?.restaurants ?? []).forEach((restaurant) => {
      restaurant.orders.forEach((order) => {
        out.push({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          amount: order.pricing?.total ?? 0,
          prepRemainingSeconds: order.preparation?.remainingSeconds ?? null,
          prepLabel: order.preparation?.label ?? "",
          restaurantName: restaurant.name,
          restaurantAddress: restaurant.address ?? "",
          restaurantLat: restaurant.location?.latitude ?? null,
          restaurantLng: restaurant.location?.longitude ?? null,
          customerName: order.customer?.name ?? "",
        });
      });
    });
    return out;
  }, [liveMapQuery.data?.restaurants]);

  const riderForMap = useMemo(() => {
    const live = liveMapQuery.data?.rider.location;
    if (isCoordinate(live)) {
      return {
        latitude: live.latitude,
        longitude: live.longitude,
        heading: typeof live.heading === "number" ? live.heading : 0,
      };
    }
    if (riderLocation) {
      return { latitude: riderLocation.latitude, longitude: riderLocation.longitude, heading: 0 };
    }
    return null;
  }, [liveMapQuery.data?.rider.location, riderLocation]);

  // Tapping a pin opens that order's detail in the bottom sheet (price, live status,
  // Set-live, actions). Drop pin = its exact order; restaurant pin = its lead pending order.
  const handleStopPress = useCallback(
    (id: string) => {
      // Always signal an expand, even if it resolves to the already-selected order.
      setExpandSignal((n) => n + 1);
      if (id.startsWith("drop:")) {
        setSelectedOrderId(id.split(":")[1]);
        return;
      }
      const restaurantId = id.slice("pickup:".length);
      const restaurant = restaurants.find((item) => item.id === restaurantId);
      const leadOrder =
        restaurant?.orders.find((order) => order.status !== "PickedUp") ??
        restaurant?.orders[0];
      if (leadOrder) setSelectedOrderId(leadOrder.id);
    },
    [restaurants]
  );

  useEffect(() => {
    if (!restaurants.length) {
      setSelectedRestaurantId("");
      setIsSheetVisible(false);
      return;
    }
    if (selectedRestaurantId && !restaurants.some((restaurant) => restaurant.id === selectedRestaurantId)) {
      setSelectedRestaurantId("");
      setIsSheetVisible(false);
    }
  }, [restaurants, selectedRestaurantId]);

  const openRestaurantSheet = (restaurant: RiderLiveMapRestaurant) => {
    setSelectedRestaurantId(restaurant.id);
    setIsSheetVisible(true);
  };

  const closeRestaurantSheet = () => {
    setIsSheetVisible(false);
    setSelectedRestaurantId("");
  };

  const deliveryMapRef = useRef<DeliveryMapHandle | null>(null);
  const profileQuery = useRiderProfileQuery();
  const availabilityMutation = useUpdateRiderAvailabilityMutation();
  const isOnline =
    (profileQuery.data?.isAvailableForAssignments ??
      rider?.isAvailableForAssignments) !== false;

  const toggleOnline = useCallback(() => {
    availabilityMutation.mutate(!isOnline);
  }, [availabilityMutation, isOnline]);

  // Recenter the map on the rider's real current position (one-shot GPS read).
  const recenter = useCallback(async () => {
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      deliveryMapRef.current?.animateTo({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      if (riderLocation) deliveryMapRef.current?.animateTo(riderLocation);
    }
  }, [riderLocation]);

  // Where the rider should head next (focused restaurant, or its picked-up drop) — used by
  // the Navigate button to hand turn-by-turn to Google Maps.
  const navigateTarget = useMemo(() => {
    if (!suggestedRestaurant) return null;
    const picked = suggestedRestaurant.orders.find(
      (order) => order.status === "PickedUp" && isCoordinate(order.customer?.location),
    );
    const destination = picked?.customer?.location ?? suggestedRestaurant.location;
    return isCoordinate(destination) ? destination : null;
  }, [suggestedRestaurant]);

  const openNavigation = useCallback(async () => {
    if (!navigateTarget) return;
    const origin = isCoordinate(riderLocation)
      ? `&origin=${encodeURIComponent(`${riderLocation.latitude},${riderLocation.longitude}`)}`
      : "";
    const url = `https://www.google.com/maps/dir/?api=1${origin}&destination=${encodeURIComponent(
      `${navigateTarget.latitude},${navigateTarget.longitude}`,
    )}&travelmode=driving`;
    await Linking.openURL(url);
  }, [navigateTarget, riderLocation]);

  return (
    <View style={styles.screen}>
      {/* Real map — mounted ONLY while this tab is focused (never in the background). The
          native Google blue dot (with its built-in heading chevron) shows the rider. Only the
          live order's road path is drawn. Pins: pink = pickup (restaurant, order-count badge
          for clusters), green = drop → customer. */}
      {isFocused ? (
        <DeliveryMap
          ref={deliveryMapRef}
          style={StyleSheet.absoluteFill}
          stops={mapStops}
          rider={riderForMap}
          routes={mapRoutes}
          showUserLocation
          fitPadding={{
            top: insets.top + 130,
            right: 60,
            bottom: Math.max(insets.bottom, 12) + 220,
            left: 60,
          }}
          onStopPress={handleStopPress}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background }]} />
      )}

      {/* Top bar: menu · online status toggle · notifications — foodpanda-style. */}
      <SafeAreaView pointerEvents="box-none" edges={["top"]} style={styles.topOverlay}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSidebarOpen(true)}
            style={({ pressed }) => [styles.circleButton, pressed ? styles.mapButtonPressed : null]}
          >
            <Ionicons name="menu" size={22} color={palette.foreground} />
          </Pressable>

          {/* Status is display-only here — the rider goes online/offline from the sidebar. */}
          <View style={styles.statusPillButton}>
            <Text style={styles.statusPillLabel}>Status</Text>
            <View style={styles.statusPillRow}>
              <Text style={styles.statusPillValue}>
                {isOnline ? copy.common.online : copy.common.offline}
              </Text>
              <View
                style={[
                  styles.statusDotBig,
                  { backgroundColor: isOnline ? palette.success : palette.mutedForeground },
                ]}
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/notifications")}
            style={({ pressed }) => [styles.circleButton, pressed ? styles.mapButtonPressed : null]}
          >
            <Ionicons name="notifications-outline" size={21} color={palette.foreground} />
            {hasUnreadNotifications ? <View style={styles.notificationDot} /> : null}
          </Pressable>
        </View>
      </SafeAreaView>

      {/* Bottom-right controls: recenter on me + navigate to next stop. */}
      <View style={[styles.mapControls, { bottom: Math.max(insets.bottom, 12) + 168 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={recenter}
          style={({ pressed }) => [styles.recenterButton, pressed ? styles.mapButtonPressed : null]}
        >
          <Ionicons name="locate" size={20} color={palette.foreground} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={openNavigation}
          disabled={!navigateTarget}
          style={({ pressed }) => [
            styles.navigateButton,
            !navigateTarget ? styles.navigateButtonDisabled : null,
            pressed ? styles.mapButtonPressed : null,
          ]}
        >
          <Ionicons name="navigate" size={21} color="#FFFFFF" />
        </Pressable>
      </View>

      {liveMapQuery.isLoading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={palette.secondary} />
          <Text style={styles.loadingText}>{mapCopy.loadingMap}</Text>
        </View>
      ) : null}

      {/* Rider's work surface: Offers + My Tasks + per-order detail, docked over the map.
          Tapping a map pin selects that order here. */}
      <HomeOrdersSheet
        selectedOrderId={selectedOrderId}
        expandSignal={expandSignal}
        isOnline={isOnline}
        onSelectOrder={setSelectedOrderId}
        contextOrders={contextOrders}
      />

      <RiderSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  circleButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  notificationDot: {
    position: "absolute",
    top: 11,
    right: 12,
    width: 11,
    height: 11,
    borderRadius: 999,
    backgroundColor: palette.danger,
    borderWidth: 2,
    borderColor: palette.surface,
  },
  statusPillButton: {
    minWidth: 150,
    borderRadius: 999,
    backgroundColor: palette.surface,
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: "center",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  statusPillLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.mutedForeground,
    textTransform: "uppercase",
  },
  statusPillRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 1 },
  statusPillValue: { fontSize: 17, fontWeight: "900", color: palette.foreground },
  statusDotBig: { width: 10, height: 10, borderRadius: 5 },
  mapControls: {
    position: "absolute",
    right: 16,
    alignItems: "center",
    gap: 12,
  },
  recenterButton: {
    width: 50,
    height: 50,
    borderRadius: 999,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  navigateButton: {
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: palette.secondary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.secondary,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  navigateButtonDisabled: { backgroundColor: palette.mutedForeground, opacity: 0.6 },
  listContent: {
    paddingHorizontal: 14,
    gap: 10,
  },
  listCard: {
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: palette.shadow,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  listIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  listBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: palette.foreground,
  },
  listMeta: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  listBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  listOrderCount: {
    fontSize: 11,
    fontWeight: "800",
    color: palette.mutedForeground,
  },
  listRight: {
    alignItems: "flex-end",
    gap: 2,
    minWidth: 64,
  },
  listDistance: {
    fontSize: 14,
    fontWeight: "900",
    color: palette.foreground,
  },
  listGo: {
    fontSize: 10,
    fontWeight: "800",
    color: palette.secondary,
    textTransform: "uppercase",
  },
  topOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  headerCard: {
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  eyebrow: {
    color: palette.secondary,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  headerTitle: {
    marginTop: 3,
    color: palette.foreground,
    fontSize: 19,
    fontWeight: "900",
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  controls: {
    position: "absolute",
    right: 14,
    gap: 8,
  },
  mapButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  mapButtonActive: {
    backgroundColor: "#FFEAF2",
    borderColor: "#FFBED4",
  },
  mapButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  restaurantMarkerWrap: {
    width: 56,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  restaurantMarkerStack: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 11,
    backgroundColor: palette.surface,
    borderWidth: 2,
    transform: [{ translateX: 4 }, { translateY: 4 }],
  },
  restaurantMarker: {
    width: 31,
    height: 31,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  markerCountBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    zIndex: 8,
    elevation: 9,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
    borderWidth: 1.5,
    borderColor: palette.surface,
  },
  markerCountText: {
    color: palette.surface,
    fontSize: 10,
    fontWeight: "900",
  },
  riderPuckRoot: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  riderPuckHalo: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(37,99,235,0.18)",
  },
  riderPuckCore: {
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  pinRoot: {
    width: 38,
    height: 44,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  pinLiftShadow: {
    position: "absolute",
    bottom: 4,
    width: 18,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.24)",
    transform: [{ scaleX: 1.18 }],
  },
  pinPointer: {
    position: "absolute",
    top: 25,
    width: 8,
    height: 8,
    borderRadius: 2,
    transform: [{ rotate: "45deg" }],
    zIndex: 1,
  },
  pin: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  customerMarker: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    borderWidth: 2,
    borderColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.6,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  customerMarkerWrap: {
    width: 52,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  customerMarkerShadow: {
    position: "absolute",
    bottom: 8,
    width: 22,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.24)",
    transform: [{ scaleX: 1.2 }],
  },
  loadingCard: {
    position: "absolute",
    left: 24,
    right: 80,
    top: 156,
    borderRadius: 16,
    padding: 14,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: palette.mutedForeground,
    fontSize: 13,
    fontWeight: "800",
  },
  bottomStrip: {
    position: "absolute",
    left: 14,
    right: 14,
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 9,
  },
  bottomStripIcon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFEAF2",
    borderWidth: 1,
    borderColor: "#FFCEE0",
  },
  bottomStripTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  bottomStripTitle: {
    color: palette.foreground,
    fontSize: 13,
    fontWeight: "900",
  },
  bottomStripMeta: {
    marginTop: 3,
    color: palette.mutedForeground,
    fontSize: 11,
    fontWeight: "700",
  },
  statusPill: {
    minHeight: 32,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "900",
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 13, 16, 0.34)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 },
    elevation: 18,
  },
  sheetHandleArea: {
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 99,
    backgroundColor: "#D8CDD3",
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 14,
  },
  sheetRestaurantIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  sheetTitle: {
    color: palette.foreground,
    fontSize: 18,
    fontWeight: "900",
  },
  sheetSubtitle: {
    marginTop: 3,
    color: palette.mutedForeground,
    fontSize: 12,
    fontWeight: "700",
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  infoCard: {
    width: "48%",
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    marginTop: 10,
    color: palette.mutedForeground,
    fontSize: 11,
    fontWeight: "800",
  },
  infoValue: {
    marginTop: 3,
    color: palette.foreground,
    fontSize: 18,
    fontWeight: "900",
  },
  infoSubtitle: {
    marginTop: 2,
    color: palette.mutedForeground,
    fontSize: 11,
    fontWeight: "700",
  },
  sheetSectionHeader: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  sheetSectionTitle: {
    color: palette.foreground,
    fontSize: 15,
    fontWeight: "900",
  },
  sheetSectionMeta: {
    flexShrink: 1,
    color: palette.mutedForeground,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
  ordersList: {
    gap: 8,
  },
  orderRow: {
    minHeight: 58,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  orderRowReady: {
    borderColor: "#B7E7D0",
    backgroundColor: palette.successSoft,
  },
  orderStateIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  orderRowBody: {
    flex: 1,
    minWidth: 0,
  },
  orderRowTitle: {
    color: palette.foreground,
    fontSize: 13,
    fontWeight: "900",
  },
  orderRowMeta: {
    marginTop: 3,
    color: palette.mutedForeground,
    fontSize: 11,
    fontWeight: "700",
  },
  orderStatusBadge: {
    minHeight: 28,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  orderStatusText: {
    fontSize: 11,
    fontWeight: "900",
  },
  sheetActions: {
    marginTop: 16,
    flexDirection: "row",
    gap: 10,
  },
  sheetPrimaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: palette.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sheetSecondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sheetSecondaryText: {
    color: palette.foreground,
    fontSize: 13,
    fontWeight: "900",
  },
  primaryActionPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  sheetPrimaryText: {
    color: palette.surface,
    fontSize: 13,
    fontWeight: "900",
  },
});
