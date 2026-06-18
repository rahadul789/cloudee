import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
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
import MapView, { Marker, Polyline, type LatLng, type Region } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  useRiderDeliveryThresholdsQuery,
  useRiderLiveMapQuery,
  useRiderMapStyleQuery,
  type RiderLiveMapOrder,
  type RiderLiveMapRestaurant,
  type RiderMapCoordinate,
} from "@/src/hooks/use-rider-api";
import { useDeliveryCopy } from "@/src/lib/copy";
import { getMapStyleSignature } from "@/src/lib/map-style";
import { useRiderAuthStore } from "@/src/store/auth-store";
import { palette } from "@/src/theme/palette";

const FALLBACK_REGION: Region = {
  latitude: 24.8765267,
  longitude: 90.7249078,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const SHEET_HEIGHT = Math.min(Dimensions.get("window").height * 0.72, 620);
const MAX_MAP_DELTA = 0.12;

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

function buildCurvedPolyline(start: RiderMapCoordinate, end: RiderMapCoordinate): LatLng[] {
  const midLatitude = (start.latitude + end.latitude) / 2;
  const midLongitude = (start.longitude + end.longitude) / 2;
  const dx = end.longitude - start.longitude;
  const dy = end.latitude - start.latitude;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const curveStrength = Math.min(0.015, Math.max(0.003, distance * 0.25));
  const controlPoint = {
    latitude: midLatitude - dx * curveStrength,
    longitude: midLongitude + dy * curveStrength,
  };
  const points: LatLng[] = [];

  for (let index = 0; index <= 24; index += 1) {
    const t = index / 24;
    const oneMinusT = 1 - t;
    points.push({
      latitude:
        oneMinusT * oneMinusT * start.latitude +
        2 * oneMinusT * t * controlPoint.latitude +
        t * t * end.latitude,
      longitude:
        oneMinusT * oneMinusT * start.longitude +
        2 * oneMinusT * t * controlPoint.longitude +
        t * t * end.longitude,
    });
  }

  return points;
}

function buildRegion(points: RiderMapCoordinate[]) {
  const validPoints = points.filter(isCoordinate);
  if (!validPoints.length) return FALLBACK_REGION;

  const minLat = Math.min(...validPoints.map((point) => point.latitude));
  const maxLat = Math.max(...validPoints.map((point) => point.latitude));
  const minLng = Math.min(...validPoints.map((point) => point.longitude));
  const maxLng = Math.max(...validPoints.map((point) => point.longitude));
  const latitudeDelta = Math.min(MAX_MAP_DELTA, Math.max(0.012, (maxLat - minLat) * 1.8 || 0.018));
  const longitudeDelta = Math.min(MAX_MAP_DELTA, Math.max(0.012, (maxLng - minLng) * 1.8 || 0.018));

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta,
    longitudeDelta,
  };
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

function RestaurantMarker({
  restaurant,
  selected,
  onPress,
}: {
  restaurant: RiderLiveMapRestaurant;
  selected: boolean;
  onPress: () => void;
}) {
  const state = getRestaurantState(restaurant);
  const tone = STATUS_COLORS[state] ?? palette.foreground;

  if (!isCoordinate(restaurant.location)) return null;

  return (
    <Marker
      coordinate={restaurant.location}
      onPress={onPress}
      zIndex={selected ? 10 : 5}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      <View style={styles.restaurantMarkerWrap}>
        {restaurant.orderCount > 1 ? (
          <View style={[styles.restaurantMarkerStack, { borderColor: `${tone}55` }]} />
        ) : null}
        <View
          style={[
            styles.restaurantMarker,
            { backgroundColor: tone, borderColor: selected ? palette.foreground : palette.surface },
          ]}
        >
          <Ionicons name="restaurant" size={14} color={palette.surface} />
        </View>
        {restaurant.orderCount > 1 ? (
          <View style={styles.markerCountBadge}>
            <Text style={styles.markerCountText}>{restaurant.orderCount}</Text>
          </View>
        ) : null}
      </View>
    </Marker>
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
  const restaurantToCustomerDistance = calculateDistanceKm(restaurant?.location, leadOrder?.customer?.location);
  const riderToRestaurantEta = estimateEtaMinutes(
    isLeadPickedUp ? riderToCustomerDistance : riderToRestaurantDistance,
    speedKmph,
    routeFactor
  );
  const restaurantToCustomerEta = estimateEtaMinutes(restaurantToCustomerDistance, speedKmph, routeFactor);

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

            <View style={styles.infoGrid}>
              <InfoCard
                icon={isLeadPickedUp ? "home" : "navigate"}
                label={isLeadPickedUp ? mapCopy.reachCustomer : mapCopy.reachRestaurant}
                value={formatEta(riderToRestaurantEta, mapCopy)}
                subtitle={formatDistance(isLeadPickedUp ? riderToCustomerDistance : riderToRestaurantDistance, mapCopy)}
                tone={palette.secondary}
              />
              <InfoCard
                icon="home"
                label={mapCopy.customerRoute}
                value={formatDistance(restaurantToCustomerDistance, mapCopy)}
                subtitle={formatEta(restaurantToCustomerEta, mapCopy)}
                tone={palette.info}
              />
              <InfoCard
                icon="bag-handle"
                label={mapCopy.orders}
                value={restaurant.orderCount}
                subtitle={mapCopy.readyCount(restaurant.readyCount)}
                tone={palette.success}
              />
              <InfoCard
                icon="timer"
                label={mapCopy.nextReady}
                value={formatRemaining(leadOrder, mapCopy)}
                subtitle={restaurant.lateCount ? mapCopy.lateCount(restaurant.lateCount) : mapCopy.planAhead}
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
  const mapRef = useRef<MapView | null>(null);
  const didInitialFitRef = useRef(false);
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { copy } = useDeliveryCopy();
  const mapCopy = copy.map;
  const rider = useRiderAuthStore((state) => state.rider);
  const liveMapQuery = useRiderLiveMapQuery(isFocused);
  const mapStyleQuery = useRiderMapStyleQuery("delivery.map_tab");
  const thresholdsQuery = useRiderDeliveryThresholdsQuery();
  const resolvedMapStyle = mapStyleQuery.data ?? undefined;
  const mapStyleSignature = useMemo(
    () => getMapStyleSignature(resolvedMapStyle),
    [resolvedMapStyle]
  );
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<Region>(FALLBACK_REGION);
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
  }, [liveMapQuery.data?.rider.location, riderLocationFromProfile?.latitude, riderLocationFromProfile?.longitude]);
  const customerOrders = useMemo(() => {
    if (!selectedRestaurant) return [];
    return selectedRestaurant.orders.filter((order) => isCoordinate(order.customer?.location));
  }, [selectedRestaurant]);
  const routeLines = useMemo(() => {
    if (!selectedRestaurant || !isCoordinate(selectedRestaurant.location)) return [];
    return selectedRestaurant.orders
      .filter((order) => isCoordinate(order.customer?.location))
      .map((order) => ({
        id: order.id,
        points: buildCurvedPolyline(
          order.status === "PickedUp" && isCoordinate(riderLocation)
            ? riderLocation
            : selectedRestaurant.location as RiderMapCoordinate,
          order.customer?.location as RiderMapCoordinate
        ),
      }));
  }, [riderLocation, selectedRestaurant]);
  const hasPickedUpSelectedRoute = useMemo(
    () => Boolean(selectedRestaurant?.orders.some((order) => order.status === "PickedUp")),
    [selectedRestaurant]
  );
  const fitPoints = useMemo(() => {
    const points: RiderMapCoordinate[] = [];
    if (isCoordinate(riderLocation)) points.push(riderLocation);
    restaurants.forEach((restaurant) => {
      if (isCoordinate(restaurant.location)) points.push(restaurant.location);
    });
    if (selectedRestaurant) {
      selectedRestaurant.orders.forEach((order) => {
        if (isCoordinate(order.customer?.location)) points.push(order.customer.location);
      });
    }
    return points;
  }, [restaurants, riderLocation, selectedRestaurant]);
  const suggestedRestaurant = useMemo(() => {
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
    })[0] ?? null;
  }, [restaurants, riderLocation]);
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

  const animateToRegion = (region: Region) => {
    setCurrentRegion(region);
    mapRef.current?.animateToRegion(region, 320);
  };

  const fitMap = () => {
    animateToRegion(buildRegion(fitPoints));
  };

  const zoomMap = (factor: number) => {
    animateToRegion({
      ...currentRegion,
      latitudeDelta: Math.min(MAX_MAP_DELTA, Math.max(0.003, currentRegion.latitudeDelta * factor)),
      longitudeDelta: Math.min(MAX_MAP_DELTA, Math.max(0.003, currentRegion.longitudeDelta * factor)),
    });
  };

  const handleRegionChangeComplete = (region: Region) => {
    const cappedRegion = {
      ...region,
      latitudeDelta: Math.min(MAX_MAP_DELTA, Math.max(0.003, region.latitudeDelta)),
      longitudeDelta: Math.min(MAX_MAP_DELTA, Math.max(0.003, region.longitudeDelta)),
    };
    setCurrentRegion(cappedRegion);
    if (
      Math.abs(cappedRegion.latitudeDelta - region.latitudeDelta) > 0.0001 ||
      Math.abs(cappedRegion.longitudeDelta - region.longitudeDelta) > 0.0001
    ) {
      mapRef.current?.animateToRegion(cappedRegion, 140);
    }
  };

  const focusRider = () => {
    if (!isCoordinate(riderLocation)) return;
    animateToRegion({
      latitude: riderLocation.latitude,
      longitude: riderLocation.longitude,
      latitudeDelta: 0.018,
      longitudeDelta: 0.018,
    });
  };

  const openRestaurantSheet = (restaurant: RiderLiveMapRestaurant) => {
    setSelectedRestaurantId(restaurant.id);
    setIsSheetVisible(true);
  };

  const closeRestaurantSheet = () => {
    setIsSheetVisible(false);
    setSelectedRestaurantId("");
  };

  useEffect(() => {
    if (!isFocused || didInitialFitRef.current || !fitPoints.length) return;
    didInitialFitRef.current = true;
    const nextRegion = buildRegion(fitPoints);
    const timer = setTimeout(() => {
      setCurrentRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 320);
    }, 240);

    return () => clearTimeout(timer);
  }, [fitPoints, isFocused]);

  return (
    <View style={styles.screen}>
      <MapView
        key={mapStyleSignature}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={buildRegion(fitPoints)}
        customMapStyle={resolvedMapStyle}
        showsCompass={false}
        showsUserLocation
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        onMapReady={fitMap}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {routeLines.map((route) => (
          <Polyline
            key={route.id}
            coordinates={route.points}
            strokeColor={palette.secondary}
            strokeWidth={2.5}
            lineDashPattern={[4, 8]}
            lineCap="round"
            lineJoin="round"
          />
        ))}
        {selectedRestaurant &&
        !hasPickedUpSelectedRoute &&
        isCoordinate(riderLocation) &&
        isCoordinate(selectedRestaurant.location) ? (
          <Polyline
            coordinates={buildCurvedPolyline(riderLocation, selectedRestaurant.location)}
            strokeColor={palette.info}
            strokeWidth={2.75}
            lineDashPattern={[6, 8]}
            lineCap="round"
          />
        ) : null}
        {restaurants.map((restaurant) => (
          <RestaurantMarker
            key={restaurant.id}
            restaurant={restaurant}
            selected={restaurant.id === selectedRestaurant?.id}
            onPress={() => openRestaurantSheet(restaurant)}
          />
        ))}
        {customerOrders.map((order) =>
          isCoordinate(order.customer?.location) ? (
            <Marker
              key={`customer-${order.id}`}
              coordinate={order.customer.location}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={4}
              onPress={() => {
                const parent = restaurants.find((restaurant) =>
                  restaurant.orders.some((item) => item.id === order.id)
                );
                if (parent) openRestaurantSheet(parent);
              }}
            >
              <View style={styles.customerMarkerWrap}>
                <View style={styles.customerMarkerShadow} />
                <View style={styles.customerMarker}>
                  <Ionicons name="home" size={13} color={palette.surface} />
                </View>
              </View>
            </Marker>
          ) : null
        )}
      </MapView>

      <SafeAreaView pointerEvents="box-none" edges={["top"]} style={styles.topOverlay}>
        <View style={styles.headerCard}>
          <View>
            <Text style={styles.eyebrow}>{mapCopy.eyebrow}</Text>
            <Text style={styles.headerTitle}>
              {restaurants.length ? mapCopy.activeRestaurants(restaurants.length) : mapCopy.noActivePickup}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => liveMapQuery.refetch()}
            style={({ pressed }) => [styles.refreshButton, pressed ? styles.mapButtonPressed : null]}
          >
            {liveMapQuery.isFetching ? (
              <ActivityIndicator size="small" color={palette.secondary} />
            ) : (
              <Ionicons name="refresh" size={18} color={palette.foreground} />
            )}
          </Pressable>
        </View>
      </SafeAreaView>

      <View style={[styles.controls, { top: insets.top + 94 }]}>
        <MapActionButton icon="add" label={mapCopy.zoomIn} onPress={() => zoomMap(0.55)} />
        <MapActionButton icon="remove" label={mapCopy.zoomOut} onPress={() => zoomMap(1.65)} />
        <MapActionButton icon="locate" label={mapCopy.focusRider} onPress={focusRider} active={isCoordinate(riderLocation)} />
        <MapActionButton
          icon="checkmark-done"
          label={mapCopy.readyOnly}
          onPress={() => setReadyOnly((value) => !value)}
          active={readyOnly}
        />
      </View>

      {liveMapQuery.isLoading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={palette.secondary} />
          <Text style={styles.loadingText}>{mapCopy.loadingMap}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={!stripRestaurant}
        onPress={() => {
          if (stripRestaurant) openRestaurantSheet(stripRestaurant);
        }}
        style={({ pressed }) => [
          styles.bottomStrip,
          { bottom: Math.max(insets.bottom, 12) + 72 },
          pressed && stripRestaurant ? styles.mapButtonPressed : null,
        ]}
      >
        {liveMapQuery.isLoading ? (
          <>
            <ActivityIndicator size="small" color={palette.secondary} />
            <View style={styles.bottomStripTextBlock}>
              <Text style={styles.bottomStripTitle}>{mapCopy.preparingMap}</Text>
              <Text style={styles.bottomStripMeta}>{mapCopy.loadingStates}</Text>
            </View>
          </>
        ) : stripRestaurant ? (
          <>
            <View style={styles.bottomStripIcon}>
              <Ionicons name="map" size={17} color={palette.secondary} />
            </View>
            <View style={styles.bottomStripTextBlock}>
              <Text style={styles.bottomStripTitle}>
                {stripPickedUpOrder
                    ? mapCopy.dropOffFirst(stripRestaurant.name)
                    : mapCopy.suggestedNext(stripRestaurant.name)}
              </Text>
              <Text numberOfLines={1} style={styles.bottomStripMeta}>
                {mapCopy.distanceAway(formatRemaining(stripOrder, mapCopy), formatDistance(stripDistance, mapCopy))}
              </Text>
            </View>
            <Ionicons name="chevron-up" size={18} color={palette.mutedForeground} />
          </>
        ) : (
          <>
            <View style={styles.bottomStripIcon}>
              <Ionicons name="map-outline" size={17} color={palette.secondary} />
            </View>
            <View style={styles.bottomStripTextBlock}>
              <Text style={styles.bottomStripTitle}>{mapCopy.noActiveNearby}</Text>
              <Text style={styles.bottomStripMeta}>{mapCopy.emptyHint}</Text>
            </View>
          </>
        )}
      </Pressable>

      <RestaurantMapSheet
        visible={isSheetVisible && Boolean(selectedRestaurant)}
        restaurant={selectedRestaurant}
        riderLocation={riderLocation}
        speedKmph={speedKmph}
        routeFactor={routeFactor}
        bottomInset={insets.bottom}
        mapCopy={mapCopy}
        onClose={closeRestaurantSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
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
    backgroundColor: palette.background,
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
