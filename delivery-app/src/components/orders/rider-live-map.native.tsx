import { Ionicons } from "@expo/vector-icons";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import MapView, {
  Marker,
  Polyline,
  type MapStyleElement,
  type Region,
} from "react-native-maps";

import { decodePolyline } from "@/src/lib/decode-polyline";
import { getMapStyleSignature } from "@/src/lib/map-style";
import { palette } from "@/src/theme/palette";

const ROUTE_PINK = "#FF2B85";
const ROUTE_CASING = "rgba(255,255,255,0.95)";
const PLANNED_LEG = "#FF9CC2";
const ESTIMATED_ROUTE = "rgba(31,36,48,0.5)";
const RIDER_OFF_ROUTE_CONNECTOR_MIN_METERS = 70;
const DESTINATION_OFF_ROUTE_CONNECTOR_MIN_METERS = 50;
const ROUTE_DRAW_SNAP_MAX_METERS = 90;
const RIDER_MAP_VISUAL_VERSION = "circle-route-v5";
// The rider's position is a custom marker fed by server/cache updates, so this map
// never starts a second native GPS client.
// Route projection and follow-camera work only need coarse updates.
export type RiderMapCoordinate = {
  latitude: number;
  longitude: number;
};

export type RiderLiveMapPhase = "to_restaurant" | "to_customer";
export type RiderLiveMapHandle = {
  recenter: () => void;
};

type RiderLiveMapProps = {
  phase: RiderLiveMapPhase;
  restaurantLocation?: RiderMapCoordinate | null;
  customerLocation?: RiderMapCoordinate | null;
  riderLocation?: RiderMapCoordinate | null;
  riderHeading?: number | null;
  /** Encoded Google route polyline for the rider's active leg. */
  routePolyline?: string | null;
  routeProvider?: "google" | "haversine" | null;
  /** Draw the rider -> active destination leg (false in preview-only mode). */
  showActiveApproachLeg?: boolean;
  /** Draw the restaurant -> customer planned leg (before pickup, for context). */
  showPlannedDeliveryLeg?: boolean;
  restaurantName?: string;
  customerName?: string;
  /** Safe-area top inset so the camera frames below the floating header. */
  topInset?: number;
  /** Height of the collapsed sheet so the camera frames above it. */
  bottomInset?: number;
  onOpenExternalNavigation?: () => void;
  mapStyle?: MapStyleElement[] | null;
};

const EARTH_RADIUS_METERS = 6_371_000;
type FollowBand = "far" | "mid" | "close" | "near";

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: RiderMapCoordinate, b: RiderMapCoordinate) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function interpolatePoint(
  start: RiderMapCoordinate,
  end: RiderMapCoordinate,
  progress: number,
): RiderMapCoordinate {
  const safeProgress = clamp(progress, 0, 1);

  return {
    latitude: start.latitude + (end.latitude - start.latitude) * safeProgress,
    longitude: start.longitude + (end.longitude - start.longitude) * safeProgress,
  };
}

function getFollowBand(distance: number): FollowBand {
  if (distance <= 180) return "near";
  if (distance <= 700) return "close";
  if (distance <= 1600) return "mid";
  return "far";
}

function buildFollowRegion(
  rider: RiderMapCoordinate,
  destination: RiderMapCoordinate,
  zoomOutFactor = 1.08,
): Region {
  const distance = distanceMeters(rider, destination);
  const band = getFollowBand(distance);
  const focusProgress =
    band === "far" ? 0.5 : band === "mid" ? 0.56 : band === "close" ? 0.64 : 0.72;
  const spanMultiplier =
    band === "far" ? 1.9 : band === "mid" ? 1.5 : band === "close" ? 1.24 : 1.08;
  const minLatitudeDelta =
    band === "far" ? 0.012 : band === "mid" ? 0.0088 : band === "close" ? 0.0052 : 0.0029;
  const minLongitudeDelta =
    band === "far" ? 0.012 : band === "mid" ? 0.0088 : band === "close" ? 0.0052 : 0.003;
  const center = interpolatePoint(rider, destination, focusProgress);
  const latitudeSpan = Math.abs(destination.latitude - rider.latitude);
  const longitudeSpan = Math.abs(destination.longitude - rider.longitude);

  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: Math.max(minLatitudeDelta, latitudeSpan * spanMultiplier) * zoomOutFactor,
    longitudeDelta: Math.max(minLongitudeDelta, longitudeSpan * spanMultiplier) * zoomOutFactor,
  };
}

function buildDirectRoute(
  start: RiderMapCoordinate,
  end: RiderMapCoordinate,
) {
  return [start, end];
}

function toLocalMeters(point: RiderMapCoordinate, refLat: number) {
  const latMeters = 110_540;
  const lngMeters = 111_320 * Math.cos((refLat * Math.PI) / 180);
  return { x: point.longitude * lngMeters, y: point.latitude * latMeters };
}

function cumulativeRouteDistances(points: RiderMapCoordinate[]) {
  const cumulative = new Array<number>(points.length).fill(0);
  for (let index = 1; index < points.length; index += 1) {
    cumulative[index] =
      cumulative[index - 1] + distanceMeters(points[index - 1], points[index]);
  }
  return cumulative;
}

function projectOntoRoute(
  points: RiderMapCoordinate[],
  cumulative: number[],
  origin: RiderMapCoordinate,
) {
  let best = {
    distanceAlong: 0,
    offRouteMeters: Number.POSITIVE_INFINITY,
    point: points[0] ?? origin,
  };

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const refLat = (start.latitude + end.latitude + origin.latitude) / 3;
    const s = toLocalMeters(start, refLat);
    const e = toLocalMeters(end, refLat);
    const o = toLocalMeters(origin, refLat);
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared > 0
        ? Math.min(1, Math.max(0, ((o.x - s.x) * dx + (o.y - s.y) * dy) / lengthSquared))
        : 0;
    const offRouteMeters = Math.hypot(o.x - (s.x + dx * t), o.y - (s.y + dy * t));

    if (offRouteMeters < best.offRouteMeters) {
      const segmentLength = cumulative[index + 1] - cumulative[index];
      best = {
        distanceAlong: cumulative[index] + segmentLength * t,
        offRouteMeters,
        point: {
          latitude: start.latitude + (end.latitude - start.latitude) * t,
          longitude: start.longitude + (end.longitude - start.longitude) * t,
        },
      };
    }
  }

  return best;
}

function buildRemainingRouteFromProjection(
  points: RiderMapCoordinate[],
  cumulative: number[],
  projection: ReturnType<typeof projectOntoRoute> | null,
) {
  if (points.length < 2 || !projection) return points;
  if (projection.offRouteMeters > ROUTE_DRAW_SNAP_MAX_METERS) return points;

  const tail = points.filter(
    (_point, index) => cumulative[index] > projection.distanceAlong + 1,
  );
  return [projection.point, ...tail];
}

function regionForPoint(point: RiderMapCoordinate, delta = 0.01): Region {
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

/**
 * Android occasionally paints custom markers blank when tracksViewChanges is
 * false from the first frame. Tracking briefly after each change keeps the pin
 * crisp without the cost of permanent re-rendering.
 */
function useTemporaryTracking(signature: string) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 1100);
    return () => clearTimeout(timer);
  }, [signature]);
  return tracking;
}

const RestaurantPin = memo(function RestaurantPin() {
  return (
    <View collapsable={false} pointerEvents="none" style={styles.markerRoot}>
      <View collapsable={false} style={styles.markerLiftShadow} />
      <View collapsable={false} style={[styles.markerPointer, styles.pinRestaurant]} />
      <View collapsable={false} style={[styles.pin, styles.pinRestaurant]}>
        <Ionicons name="storefront" size={12} color="#fff" />
      </View>
    </View>
  );
});

const CustomerPin = memo(function CustomerPin() {
  return (
    <View collapsable={false} pointerEvents="none" style={styles.markerRoot}>
      <View collapsable={false} style={styles.markerLiftShadow} />
      <View collapsable={false} style={[styles.markerPointer, styles.pinCustomer]} />
      <View collapsable={false} style={[styles.pin, styles.pinCustomer]}>
        <Ionicons name="home" size={12} color="#fff" />
      </View>
    </View>
  );
});

const RiderPin = memo(function RiderPin({ heading }: { heading?: number | null }) {
  const headingStyle: ViewStyle | null =
    typeof heading === "number" && Number.isFinite(heading)
      ? { transform: [{ rotate: `${heading}deg` }] }
      : null;

  return (
    <View collapsable={false} pointerEvents="none" style={styles.riderPuckRoot}>
      <View collapsable={false} style={styles.riderPuckHalo} />
      <View collapsable={false} style={styles.riderPuckCore} />
      <View collapsable={false} style={[styles.riderPuckArrow, headingStyle]} />
    </View>
  );
});

const RiderLiveMapInner = forwardRef<RiderLiveMapHandle, RiderLiveMapProps>(function RiderLiveMap({
  phase,
  restaurantLocation,
  customerLocation,
  riderLocation,
  riderHeading,
  routePolyline,
  routeProvider,
  showActiveApproachLeg = true,
  showPlannedDeliveryLeg = false,
  restaurantName,
  customerName,
  topInset = 0,
  bottomInset = 0,
  onOpenExternalNavigation,
  mapStyle,
}, ref) {
  const mapRef = useRef<MapView | null>(null);
  const mapReadyRef = useRef(false);
  const frameCameraRef = useRef<(animated: boolean) => void>(() => undefined);
  const [followEnabled, setFollowEnabled] = useState(true);
  const lastFollowBandRef = useRef<FollowBand | null>(null);
  const lastFollowRiderRef = useRef<RiderMapCoordinate | null>(null);
  const lastFollowDestinationRef = useRef<RiderMapCoordinate | null>(null);

  // Route-trimming / follow-camera anchor. This comes from server/cache updates rather
  // than a per-screen GPS stream, so maps never start their own location clients.
  const effectiveRiderLocation = riderLocation ?? null;

  const resolvedMapStyle = mapStyle ?? undefined;
  const mapStyleSignature = useMemo(
    () => getMapStyleSignature(resolvedMapStyle),
    [resolvedMapStyle],
  );

  useEffect(() => {
    mapReadyRef.current = false;
  }, [mapStyleSignature]);

  const activeDestination = phase === "to_customer" ? customerLocation : restaurantLocation;

  const realRoutePoints = useMemo(() => decodePolyline(routePolyline), [routePolyline]);
  const realRouteCumulative = useMemo(
    () => cumulativeRouteDistances(realRoutePoints),
    [realRoutePoints],
  );
  const hasRealRoute = routeProvider === "google" && realRoutePoints.length >= 2;
  const riderRouteProjection = useMemo(
    () =>
      hasRealRoute && effectiveRiderLocation
        ? projectOntoRoute(realRoutePoints, realRouteCumulative, effectiveRiderLocation)
        : null,
    [effectiveRiderLocation, hasRealRoute, realRouteCumulative, realRoutePoints],
  );
  const remainingRealRoute = useMemo(
    () =>
      hasRealRoute
        ? buildRemainingRouteFromProjection(
            realRoutePoints,
            realRouteCumulative,
            riderRouteProjection,
          )
        : [],
    [hasRealRoute, realRouteCumulative, realRoutePoints, riderRouteProjection],
  );

  const activeRoute = useMemo(() => {
    if (!showActiveApproachLeg) return [] as RiderMapCoordinate[];
    if (hasRealRoute) {
      return remainingRealRoute.length >= 2 ? remainingRealRoute : realRoutePoints;
    }
    if (effectiveRiderLocation && activeDestination) {
      return buildDirectRoute(effectiveRiderLocation, activeDestination);
    }
    return [] as RiderMapCoordinate[];
  }, [
    activeDestination,
    effectiveRiderLocation,
    hasRealRoute,
    remainingRealRoute,
    realRoutePoints,
    showActiveApproachLeg,
  ]);

  // Bridge the gap when the road route ends short of the rider / destination pin.
  const offRoadToDestination = useMemo(() => {
    if (!hasRealRoute || !showActiveApproachLeg || !activeDestination) return null;
    const route = remainingRealRoute.length >= 2 ? remainingRealRoute : realRoutePoints;
    const last = route[route.length - 1];
    return distanceMeters(last, activeDestination) > DESTINATION_OFF_ROUTE_CONNECTOR_MIN_METERS
      ? [last, activeDestination]
      : null;
  }, [activeDestination, hasRealRoute, realRoutePoints, remainingRealRoute, showActiveApproachLeg]);

  const offRoadFromRider = useMemo(() => {
    if (!hasRealRoute || !showActiveApproachLeg || !effectiveRiderLocation || !riderRouteProjection) return null;
    return riderRouteProjection.offRouteMeters > RIDER_OFF_ROUTE_CONNECTOR_MIN_METERS
      ? [effectiveRiderLocation, riderRouteProjection.point]
      : null;
  }, [effectiveRiderLocation, hasRealRoute, riderRouteProjection, showActiveApproachLeg]);

  const plannedDeliveryRoute = useMemo(() => {
    if (!showPlannedDeliveryLeg || !restaurantLocation || !customerLocation) {
      return [] as RiderMapCoordinate[];
    }
    return buildDirectRoute(restaurantLocation, customerLocation);
  }, [customerLocation, restaurantLocation, showPlannedDeliveryLeg]);

  const framingPoints = useMemo(() => {
    const points: RiderMapCoordinate[] = [];
    if (showActiveApproachLeg) {
      if (effectiveRiderLocation) points.push(effectiveRiderLocation);
      if (activeDestination) points.push(activeDestination);
      if (activeRoute.length > 2) {
        const sampleEvery = Math.max(1, Math.ceil(activeRoute.length / 6));
        activeRoute.forEach((point, index) => {
          if (
            index === 0 ||
            index === activeRoute.length - 1 ||
            index % sampleEvery === 0
          ) {
            points.push(point);
          }
        });
      }
    } else {
      if (restaurantLocation) points.push(restaurantLocation);
      if (customerLocation) points.push(customerLocation);
    }
    if (!points.length) {
      const fallback = effectiveRiderLocation ?? restaurantLocation ?? customerLocation;
      if (fallback) points.push(fallback);
    }
    return points;
  }, [
    activeDestination,
    activeRoute,
    customerLocation,
    effectiveRiderLocation,
    restaurantLocation,
    showActiveApproachLeg,
  ]);

  const frameSignature = useMemo(
    () =>
      [
        phase,
        showActiveApproachLeg ? "1" : "0",
        showPlannedDeliveryLeg ? "1" : "0",
        hasRealRoute ? "route:real" : "route:none",
        restaurantLocation
          ? `${restaurantLocation.latitude.toFixed(4)},${restaurantLocation.longitude.toFixed(4)}`
          : "restaurant:none",
        customerLocation
          ? `${customerLocation.latitude.toFixed(4)},${customerLocation.longitude.toFixed(4)}`
          : "customer:none",
        effectiveRiderLocation ? "rider:yes" : "rider:none",
      ].join("|"),
    [
      customerLocation,
      effectiveRiderLocation,
      hasRealRoute,
      phase,
      restaurantLocation,
      showActiveApproachLeg,
      showPlannedDeliveryLeg,
    ],
  );

  const edgePadding = useMemo(
    () => ({
      top: topInset + 46,
      right: 38,
      bottom: bottomInset + 18,
      left: 38,
    }),
    [bottomInset, topInset],
  );

  const frameCamera = useCallback(
    (animated: boolean) => {
      if (!mapReadyRef.current || !framingPoints.length) return;
      if (framingPoints.length === 1) {
        mapRef.current?.animateToRegion(
          regionForPoint(framingPoints[0], 0.012),
          animated ? 320 : 1,
        );
        return;
      }
      mapRef.current?.fitToCoordinates(framingPoints, {
        edgePadding,
        animated,
      });
    },
    [edgePadding, framingPoints],
  );

  useEffect(() => {
    frameCameraRef.current = frameCamera;
  }, [frameCamera]);

  useEffect(() => {
    if (!followEnabled) return;
    frameCameraRef.current(true);
  }, [followEnabled, frameSignature]);

  const handleRecenter = useCallback(() => {
    setFollowEnabled(true);
    if (showActiveApproachLeg && effectiveRiderLocation && activeDestination) {
      mapRef.current?.animateToRegion(
        buildFollowRegion(
          effectiveRiderLocation,
          activeDestination,
          1 + Math.min(0.12, (topInset + bottomInset) / 1200),
        ),
        380,
      );
      return;
    }
    frameCamera(true);
  }, [
    activeDestination,
    bottomInset,
    effectiveRiderLocation,
    frameCamera,
    showActiveApproachLeg,
    topInset,
  ]);


  useImperativeHandle(ref, () => ({ recenter: () => handleRecenter() }), [handleRecenter]);

  const followBand = useMemo(() => {
    if (!effectiveRiderLocation || !activeDestination) return null;
    return getFollowBand(distanceMeters(effectiveRiderLocation, activeDestination));
  }, [activeDestination, effectiveRiderLocation]);

  useEffect(() => {
    if (
      !mapReadyRef.current ||
      !followEnabled ||
      !showActiveApproachLeg ||
      !effectiveRiderLocation ||
      !activeDestination ||
      !followBand
    ) {
      return;
    }

    const destinationChanged =
      !lastFollowDestinationRef.current ||
      distanceMeters(lastFollowDestinationRef.current, activeDestination) > 16;
    const movedMeters = lastFollowRiderRef.current
      ? distanceMeters(lastFollowRiderRef.current, effectiveRiderLocation)
      : Number.POSITIVE_INFINITY;
    const moveThreshold =
      followBand === "near"
        ? 18
        : followBand === "close"
          ? 42
          : followBand === "mid"
            ? 84
            : 140;
    const shouldReframe =
      destinationChanged ||
      lastFollowBandRef.current !== followBand ||
      movedMeters >= moveThreshold;

    if (!shouldReframe) {
      return;
    }

    mapRef.current?.animateToRegion(
      buildFollowRegion(
        effectiveRiderLocation,
        activeDestination,
        1 + Math.min(0.12, (topInset + bottomInset) / 1200),
      ),
      followBand === "near" ? 320 : 420,
    );

    lastFollowBandRef.current = followBand;
    lastFollowRiderRef.current = effectiveRiderLocation;
    lastFollowDestinationRef.current = activeDestination;
  }, [
    activeDestination,
    bottomInset,
    effectiveRiderLocation,
    followBand,
    followEnabled,
    showActiveApproachLeg,
    topInset,
  ]);

  const restaurantTracking = useTemporaryTracking(
    restaurantLocation
      ? `${restaurantLocation.latitude},${restaurantLocation.longitude}`
      : "none",
  );
  const customerTracking = useTemporaryTracking(
    customerLocation ? `${customerLocation.latitude},${customerLocation.longitude}` : "none",
  );
  const riderTracking = useTemporaryTracking(
    effectiveRiderLocation
      ? `${effectiveRiderLocation.latitude},${effectiveRiderLocation.longitude},${riderHeading ?? "none"}`
      : "none",
  );
  const initialRegion = useMemo(() => {
    const anchor =
      effectiveRiderLocation ?? activeDestination ?? restaurantLocation ?? customerLocation;
    return anchor ? regionForPoint(anchor, 0.05) : undefined;
  }, [
    activeDestination,
    customerLocation,
    effectiveRiderLocation,
    restaurantLocation,
  ]);

  return (
    <View style={styles.root}>
      <MapView
        key={`${mapStyleSignature}-${RIDER_MAP_VISUAL_VERSION}`}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={resolvedMapStyle}
        showsMyLocationButton={false}
        showsCompass
        toolbarEnabled={false}
        showsPointsOfInterest={false}
        pitchEnabled={false}
        rotateEnabled
        scrollEnabled
        zoomEnabled
        moveOnMarkerPress={false}
        minZoomLevel={3}
        maxZoomLevel={20}
        onPanDrag={() => setFollowEnabled(false)}
        onMapReady={() => {
          mapReadyRef.current = true;
          frameCamera(false);
        }}
      >
        {plannedDeliveryRoute.length > 1 ? (
          <Polyline
            coordinates={plannedDeliveryRoute}
            strokeColor={PLANNED_LEG}
            strokeWidth={3}
            lineDashPattern={[7, 9]}
            lineCap="round"
            lineJoin="round"
            zIndex={1}
          />
        ) : null}

        {activeRoute.length > 1 ? (
          <>
            {hasRealRoute ? (
              <Polyline
                coordinates={activeRoute}
                strokeColor={ROUTE_CASING}
                strokeWidth={7}
                lineCap="round"
                lineJoin="round"
                zIndex={2}
              />
            ) : null}
            <Polyline
              coordinates={activeRoute}
              strokeColor={hasRealRoute ? ROUTE_PINK : ESTIMATED_ROUTE}
              strokeWidth={hasRealRoute ? 4 : 3}
              lineCap="round"
              lineJoin="round"
              {...(hasRealRoute ? {} : { lineDashPattern: [8, 8] })}
              zIndex={3}
            />
          </>
        ) : null}

        {offRoadFromRider ? (
          <Polyline
            coordinates={offRoadFromRider}
            strokeColor={ROUTE_PINK}
            strokeWidth={3}
            lineDashPattern={[2, 8]}
            lineCap="round"
            lineJoin="round"
            zIndex={3}
          />
        ) : null}
        {offRoadToDestination ? (
          <Polyline
            coordinates={offRoadToDestination}
            strokeColor={ROUTE_PINK}
            strokeWidth={3}
            lineDashPattern={[2, 8]}
            lineCap="round"
            lineJoin="round"
            zIndex={3}
          />
        ) : null}

        {restaurantLocation ? (
          <Marker
            key={`restaurant-${RIDER_MAP_VISUAL_VERSION}-${restaurantLocation.latitude.toFixed(5)}-${restaurantLocation.longitude.toFixed(5)}`}
            coordinate={restaurantLocation}
            anchor={{ x: 0.5, y: 0.78 }}
            title={restaurantName ?? "Restaurant"}
            tracksViewChanges={restaurantTracking}
            zIndex={4}
          >
            <RestaurantPin />
          </Marker>
        ) : null}

        {customerLocation ? (
          <Marker
            key={`customer-${RIDER_MAP_VISUAL_VERSION}-${customerLocation.latitude.toFixed(5)}-${customerLocation.longitude.toFixed(5)}`}
            coordinate={customerLocation}
            anchor={{ x: 0.5, y: 0.78 }}
            title={customerName ?? "Customer"}
            tracksViewChanges={customerTracking}
            zIndex={5}
          >
            <CustomerPin />
          </Marker>
        ) : null}

        {effectiveRiderLocation ? (
          <Marker
            key={`rider-${RIDER_MAP_VISUAL_VERSION}`}
            coordinate={effectiveRiderLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            title="You"
            tracksViewChanges={riderTracking}
            zIndex={6}
          >
            <RiderPin heading={riderHeading} />
          </Marker>
        ) : null}
      </MapView>

      <View style={[styles.controls, { bottom: bottomInset + 16 }]} pointerEvents="box-none">
        {onOpenExternalNavigation ? (
          <Pressable style={styles.controlButton} onPress={onOpenExternalNavigation} hitSlop={6}>
            <Ionicons name="navigate" size={20} color={ROUTE_PINK} />
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.controlButton, followEnabled && styles.controlButtonActive]}
          onPress={handleRecenter}
          hitSlop={6}
        >
          <Ionicons
            name="locate"
            size={20}
            color={followEnabled ? "#fff" : palette.foreground}
          />
        </Pressable>
      </View>
    </View>
  );
});

RiderLiveMapInner.displayName = "RiderLiveMap";
export const RiderLiveMap = memo(RiderLiveMapInner);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#EEF4E8",
  },
  controls: {
    position: "absolute",
    right: 16,
    gap: 10,
    alignItems: "center",
  },
  controlButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: palette.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  controlButtonActive: {
    backgroundColor: ROUTE_PINK,
    borderColor: ROUTE_PINK,
  },
  markerRoot: {
    alignItems: "center",
    justifyContent: "flex-start",
    width: 38,
    height: 44,
    paddingTop: 2,
  },
  markerLiftShadow: {
    position: "absolute",
    bottom: 4,
    width: 18,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.24)",
    transform: [{ scaleX: 1.18 }],
  },
  markerPointer: {
    position: "absolute",
    top: 25,
    width: 8,
    height: 8,
    borderRadius: 2,
    transform: [{ rotate: "45deg" }],
    zIndex: 1,
  },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  pinRestaurant: {
    backgroundColor: palette.primary,
  },
  pinCustomer: {
    backgroundColor: palette.foreground,
  },
  pinRider: {
    backgroundColor: ROUTE_PINK,
  },
  riderPuckRoot: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  riderPuckHalo: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(37,99,235,0.18)",
  },
  riderPuckCore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    borderWidth: 2.5,
    borderColor: "#fff",
  },
  riderPuckArrow: {
    position: "absolute",
    top: -3,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#2563EB",
  },
  riderArrow: {
    marginTop: -1,
  },
});
