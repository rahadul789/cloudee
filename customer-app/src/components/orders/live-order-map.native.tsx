import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import MapView, {
  AnimatedRegion,
  Marker,
  MarkerAnimated,
  Polyline,
  type MapStyleElement,
} from "react-native-maps";

import { getMapStyleSignature } from "@/src/lib/map-style";
import {
  buildCurvedRoutePoints,
  calculateDistanceMeters,
  getTrackingCameraBand,
  getTrackingViewportRegion,
  offsetCoordinateByDistance,
  TRACKING_ARRIVED_DISTANCE_METERS,
  TRACKING_NEARBY_DISTANCE_METERS,
  type TrackingCoordinate,
} from "@/src/lib/order-tracking";
import { decodePolyline } from "@/src/lib/decode-polyline";
import { palette } from "@/src/theme/palette";

type LiveOrderMapProps = {
  customerLocation: TrackingCoordinate;
  restaurantLocation?: TrackingCoordinate | null;
  riderLocation?: TrackingCoordinate | null;
  status: string;
  riderAccentColor: string;
  riderName: string;
  riderVehicleIcon?: "bicycle-outline" | "rocket-outline";
  riderHeading?: number | null;
  /** Encoded Google route polyline from the backend (real road route). */
  routePolyline?: string | null;
  routeDistanceKm?: number | null;
  routeDurationMinutes?: number | null;
  routeProvider?: "google" | "haversine" | null;
  trafficAware?: boolean | null;
  mapStyle?: MapStyleElement[] | null;
};

const FOODPANDA_PINK = "#FF2B85";
const ESTIMATED_ROUTE = "rgba(31, 36, 48, 0.45)";
const RIDER_PIN_YELLOW = "#FFD54A";
const RIDER_ICON_DARK = "#1F2430";
const OFF_ROAD_GAP_METERS = 25;
// The destination is a FIXED saved pin (no GPS jitter), so any real gap between
// the road route's end and the pin is a genuine off-road handoff. Keep the floor
// small — just above a road-snapped pin's few metres — so off-road homes always
// get the dotted "last metres" connector to the exact location.
const DESTINATION_OFF_ROUTE_CONNECTOR_MIN_METERS = 12;
const MAP_HEIGHT_SCREEN_RATIO = 0.54;
const ROUTE_DETOUR_DIRECT_MAX_METERS = 180;
const ROUTE_DETOUR_ROUTE_MIN_METERS = 450;
const ROUTE_DETOUR_RATIO = 4;
const TRACKING_MAP_VISUAL_VERSION = "pin-route-v8";
// The camera frames the whole route, but never tighter than this span — so when the
// rider is metres away the map keeps a comfortable ~600m context (street names,
// surroundings) instead of zooming into an unreadable blob. This is how Foodpanda/Uber
// behave on a near arrival.
const MIN_CAMERA_LAT_DELTA = 0.006;
const MIN_CAMERA_LNG_DELTA = 0.006;
// Extra margin around the route's bounding box so markers don't sit on the edge.
const CAMERA_BOUNDS_PADDING = 1.4;

function formatDistance(meters: number) {
  const safeMeters = Number.isFinite(meters) ? Math.max(0, meters) : 0;

  if (safeMeters < 1000) {
    return `${Math.max(20, Math.round(safeMeters / 10) * 10)} m`;
  }

  const kilometers = safeMeters / 1000;
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km`;
}

function formatEta(minutes?: number | null) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
    return "Soon";
  }

  return `${Math.max(1, Math.round(minutes))} min`;
}

// Build a camera region that contains every given coordinate, padded, but never
// tighter than the minimum span (the anti-over-zoom floor).
function getCameraRegion(points: TrackingCoordinate[]) {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(
      (maxLat - minLat) * CAMERA_BOUNDS_PADDING,
      MIN_CAMERA_LAT_DELTA,
    ),
    longitudeDelta: Math.max(
      (maxLng - minLng) * CAMERA_BOUNDS_PADDING,
      MIN_CAMERA_LNG_DELTA,
    ),
  };
}

// Marker interpolation tuning.
const RIDER_TELEPORT_SNAP_METERS = 150; // big jump (GPS jump / reconnect) → snap, don't crawl
const RIDER_MIN_ANIMATE_METERS = 3; // ignore GPS jitter; snap tiny moves
const RIDER_MIN_ANIM_MS = 800;
const RIDER_MAX_ANIM_MS = 16_000;

// Within this distance the rider is treated as ON the road: the marker snaps onto the
// route so it always rides the road, and normal GPS error (10-30m) never renders the
// marker off-road. Beyond it the rider is genuinely off the network — the marker stays
// at the raw GPS point and a dotted connector bridges the gap to the road.
const RIDER_SNAP_MAX_METERS = 40;

function toLocalMeters(point: TrackingCoordinate, refLat: number) {
  const latMeters = 110_540;
  const lngMeters = 111_320 * Math.cos((refLat * Math.PI) / 180);
  return { x: point.longitude * lngMeters, y: point.latitude * latMeters };
}

function cumulativeRouteDistances(points: TrackingCoordinate[]) {
  const cumulative = new Array<number>(points.length).fill(0);
  for (let index = 1; index < points.length; index += 1) {
    cumulative[index] =
      cumulative[index - 1] +
      calculateDistanceMeters(points[index - 1], points[index]);
  }
  return cumulative;
}

// Project a coordinate onto the route: how far along the route (metres) the nearest
// point sits, plus how far off-route the coordinate is. Mirrors the backend maths.
function projectOntoRoute(
  points: TrackingCoordinate[],
  cumulative: number[],
  origin: TrackingCoordinate,
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
  points: TrackingCoordinate[],
  cumulative: number[],
  projection: ReturnType<typeof projectOntoRoute> | null,
) {
  if (points.length < 2 || !projection) return points;

  // Always trim the remaining route to start at the rider's projection — even when
  // the rider is well off the road (large offRouteMeters). Returning the full route
  // there was the bug where the solid polyline still showed the already-passed part
  // and the rider's dotted connector attached to the MIDDLE of it instead of its start.
  const tail = points.filter(
    (_point, index) => cumulative[index] > projection.distanceAlong + 1,
  );
  return [projection.point, ...tail];
}

/**
 * Smoothly interpolates the rider marker between socket updates instead of letting it
 * teleport. Position lives in an AnimatedRegion (native, ref-based), so there is no
 * per-frame React state and no re-render while it glides.
 *
 * The marker rides the ROAD. When the rider is within RIDER_SNAP_MAX_METERS of the
 * route its position is the projection onto the route (snapped on-road), and it glides
 * ALONG the polyline between consecutive projections — so it never sits off-road and
 * never zig-zags. On the same route it only ever advances toward the customer (backward
 * GPS jitter is ignored); a genuine backtrack arrives as a refreshed route, which
 * re-baselines. When the rider is genuinely off the network the marker uses the raw
 * point (a dotted connector shows the gap). Delivered / teleport / sub-jitter snap.
 */
function useAnimatedRiderCoordinate(
  rawTarget: TrackingCoordinate,
  projection: ReturnType<typeof projectOntoRoute> | null,
  status: string,
  routePoints: TrackingCoordinate[],
  cumulative: number[],
) {
  const onRoute =
    projection != null && projection.offRouteMeters <= RIDER_SNAP_MAX_METERS;
  // Where the marker should actually be: snapped onto the road when on-route, else raw.
  const dest = onRoute ? projection!.point : rawTarget;
  const along = onRoute ? projection!.distanceAlong : null;

  const regionRef = useRef<AnimatedRegion | null>(null);
  if (!regionRef.current) {
    regionRef.current = new AnimatedRegion({
      latitude: dest.latitude,
      longitude: dest.longitude,
      latitudeDelta: 0,
      longitudeDelta: 0,
    });
  }
  const prevMarkerRef = useRef<TrackingCoordinate>(dest);
  const prevAlongRef = useRef<number | null>(along);
  const routeRef = useRef(cumulative);
  const lastUpdateAtRef = useRef(Date.now());
  const animationRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;

    // A refreshed route changes the distance-along scale, so the old baseline is
    // meaningless — reset it and glide straight onto the new route this once.
    if (routeRef.current !== cumulative) {
      routeRef.current = cumulative;
      prevAlongRef.current = null;
    }

    const prevAlong = prevAlongRef.current;

    // Ignore backward jitter on the SAME route: the marker only advances toward the
    // customer. This is what removes the forward/backward wobble.
    if (
      along != null &&
      prevAlong != null &&
      along < prevAlong - RIDER_MIN_ANIMATE_METERS
    ) {
      return;
    }

    const now = Date.now();
    const elapsedMs = now - lastUpdateAtRef.current;
    const previous = prevMarkerRef.current;
    const movedMeters = calculateDistanceMeters(previous, dest);

    lastUpdateAtRef.current = now;
    prevMarkerRef.current = dest;
    if (along != null) prevAlongRef.current = along;

    animationRef.current?.stop();

    const snapInstantly =
      status === "Delivered" ||
      movedMeters < RIDER_MIN_ANIMATE_METERS ||
      movedMeters > RIDER_TELEPORT_SNAP_METERS;

    if (snapInstantly) {
      region.setValue({
        latitude: dest.latitude,
        longitude: dest.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      return;
    }

    // Glide over (roughly) the real gap between updates so movement stays continuous
    // and the next update lands about when this glide finishes.
    const duration = Math.min(
      Math.max(elapsedMs, RIDER_MIN_ANIM_MS),
      RIDER_MAX_ANIM_MS,
    );

    const timingTo = (point: TrackingCoordinate, ms: number) =>
      region.timing({
        latitude: point.latitude,
        longitude: point.longitude,
        duration: Math.max(50, ms),
        useNativeDriver: false,
        // react-native-maps types AnimatedRegion.timing as if it needed Animated.timing's
        // `toValue`; the runtime API animates the coordinate fields passed here.
      } as unknown as Parameters<typeof region.timing>[0]);

    // On-road glide: walk the polyline waypoints between the previous and new
    // projection so the marker follows the road, not a straight line across blocks.
    if (along != null && prevAlong != null && along > prevAlong) {
      const between: TrackingCoordinate[] = [];
      for (let index = 0; index < routePoints.length; index += 1) {
        if (cumulative[index] > prevAlong && cumulative[index] < along) {
          between.push(routePoints[index]);
        }
      }
      const path = [previous, ...between, dest];
      if (path.length > 2) {
        const segmentLengths: number[] = [];
        let totalLength = 0;
        for (let index = 0; index < path.length - 1; index += 1) {
          const length = calculateDistanceMeters(path[index], path[index + 1]);
          segmentLengths.push(length);
          totalLength += length;
        }
        if (totalLength > 0) {
          const animations = path
            .slice(1)
            .map((point, index) =>
              timingTo(point, duration * (segmentLengths[index] / totalLength)),
            );
          const sequence = Animated.sequence(
            animations as unknown as Animated.CompositeAnimation[],
          );
          animationRef.current = sequence;
          sequence.start();
          return;
        }
      }
    }

    // Fallback: straight glide (off-route, or the first fix onto a route).
    const animation = timingTo(dest, duration);
    animationRef.current = animation;
    animation.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest.latitude, dest.longitude, along, status, cumulative]);

  useEffect(() => () => animationRef.current?.stop(), []);

  return regionRef.current;
}

const HomeMarkerContent = memo(function HomeMarkerContent() {
  return (
    <View collapsable={false} pointerEvents="none" style={styles.markerRoot}>
      <View collapsable={false} style={styles.markerLiftShadow} />
      <View collapsable={false} style={[styles.markerPointer, styles.customerMarkerPin]} />
      <View collapsable={false} style={[styles.mapMarkerPin, styles.customerMarkerPin]}>
        <Ionicons name="home" size={14} color="#fff" />
      </View>
    </View>
  );
});

// Same teardrop-pin shape as the customer marker (which renders crisply and never
// crops), just tinted yellow with a bike glyph. Interpolation is unaffected — only the
// pin content differs.
const RiderMarkerContent = memo(function RiderMarkerContent() {
  return (
    <View collapsable={false} pointerEvents="none" style={styles.markerRoot}>
      <View collapsable={false} style={styles.markerLiftShadow} />
      <View collapsable={false} style={[styles.markerPointer, styles.riderMarkerPin]} />
      <View collapsable={false} style={[styles.mapMarkerPin, styles.riderMarkerPin]}>
        <Ionicons name="bicycle" size={15} color={RIDER_ICON_DARK} />
      </View>
    </View>
  );
});

export const LiveOrderMap = memo(function LiveOrderMap({
  customerLocation,
  restaurantLocation,
  riderLocation,
  status,
  riderName,
  routePolyline,
  routeDistanceKm,
  routeDurationMinutes,
  routeProvider,
  trafficAware,
  mapStyle,
}: LiveOrderMapProps) {
  const { height: windowHeight } = useWindowDimensions();
  const mapRef = useRef<MapView | null>(null);
  const mapReadyRef = useRef(false);
  const lastCameraSignatureRef = useRef("");
  const lastProximityStateRef = useRef<"default" | "nearby" | "arriving">("default");
  // Vector markers must paint into the native snapshot once, then stop tracking view
  // changes — leaving tracksViewChanges on permanently re-rasterises the marker every
  // frame (jank), which is also why the old PNG marker often rendered blank.
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  const mapHeight = useMemo(
    () => Math.min(560, Math.max(360, Math.round(windowHeight * MAP_HEIGHT_SCREEN_RATIO))),
    [windowHeight],
  );
  const resolvedMapStyle = mapStyle ?? undefined;
  const mapStyleSignature = useMemo(
    () => getMapStyleSignature(resolvedMapStyle),
    [resolvedMapStyle],
  );

  useEffect(() => {
    mapReadyRef.current = false;
    lastCameraSignatureRef.current = "";
    // The MapView remounts when the style changes, so markers must repaint.
    setTracksViewChanges(true);
  }, [mapStyleSignature]);

  // Stop tracking view changes shortly after mount/repaint. Vector icons render
  // synchronously, so a brief window is plenty to capture the snapshot.
  useEffect(() => {
    if (!tracksViewChanges) return;
    const timer = setTimeout(() => setTracksViewChanges(false), 1200);
    return () => clearTimeout(timer);
  }, [tracksViewChanges]);

  const routeAnchorLocation = useMemo(
    () =>
      status === "Delivered"
        ? customerLocation
        : riderLocation ?? restaurantLocation ?? offsetCoordinateByDistance(customerLocation, 1000, 128),
    [customerLocation, restaurantLocation, riderLocation, status],
  );

  const resolvedRiderLocation = useMemo(() => {
    if (status === "Delivered") {
      return customerLocation;
    }

    return riderLocation ?? routeAnchorLocation;
  }, [customerLocation, riderLocation, routeAnchorLocation, status]);

  const realRoutePoints = useMemo(
    () => decodePolyline(routePolyline),
    [routePolyline],
  );
  const realRouteCumulative = useMemo(
    () => cumulativeRouteDistances(realRoutePoints),
    [realRoutePoints],
  );
  const distanceMeters = useMemo(
    () => calculateDistanceMeters(resolvedRiderLocation, customerLocation),
    [customerLocation, resolvedRiderLocation],
  );
  const routeDistanceMeters =
    typeof routeDistanceKm === "number" && Number.isFinite(routeDistanceKm)
      ? Math.max(0, routeDistanceKm * 1000)
      : null;
  const hasRouteDetour =
    routeProvider === "google" &&
    routeDistanceMeters !== null &&
    distanceMeters <= ROUTE_DETOUR_DIRECT_MAX_METERS &&
    routeDistanceMeters >= ROUTE_DETOUR_ROUTE_MIN_METERS &&
    routeDistanceMeters / Math.max(distanceMeters, OFF_ROAD_GAP_METERS) >=
      ROUTE_DETOUR_RATIO;
  // Trust the real Google route whenever we have one: show it SOLID. The old
  // `!hasRouteDetour` clause hid a genuine long road route (e.g. a river/bridge
  // crossing) behind a straight dotted curve just because the rider was close in a
  // straight line — that's the "route shows as dotted" bug. The final off-road gap
  // to the exact pin is still handled by the dotted offRoadToCustomer connector.
  const hasRealRoute = routeProvider === "google" && realRoutePoints.length >= 2;
  const riderRouteProjection = useMemo(
    () =>
      hasRealRoute
        ? projectOntoRoute(realRoutePoints, realRouteCumulative, resolvedRiderLocation)
        : null,
    [hasRealRoute, realRouteCumulative, realRoutePoints, resolvedRiderLocation],
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

  // Smoothly interpolated rider position for the marker. When a real road route is
  // available it glides along the polyline (route-snapping); otherwise it falls back
  // to a straight glide. The discrete resolvedRiderLocation still drives the
  // route/camera maths.
  const riderAnimatedCoordinate = useAnimatedRiderCoordinate(
    resolvedRiderLocation,
    riderRouteProjection,
    status,
    realRoutePoints,
    realRouteCumulative,
  );

  const remainingRoute = useMemo(() => {
    // Prefer the real road route from Google Directions when available;
    // otherwise fall back to the smooth synthetic curve. When Google returns a
    // long detour for a physically nearby rider, treat it as an off-road handoff.
    if (hasRealRoute) {
      return remainingRealRoute.length >= 2 ? remainingRealRoute : realRoutePoints;
    }

    if (riderLocation) {
      return buildCurvedRoutePoints(
        riderLocation,
        customerLocation,
        hasRouteDetour ? 10 : 20,
      );
    }

    return [resolvedRiderLocation, customerLocation];
  }, [
    customerLocation,
    hasRealRoute,
    hasRouteDetour,
    remainingRealRoute,
    realRoutePoints,
    resolvedRiderLocation,
    riderLocation,
  ]);

  // When the rider/customer pin sits off the road network, the road route ends a
  // little away from the actual pin. Bridge that gap with a dotted "last metres"
  // connector so the rider clearly sees how to reach the exact point.
  const offRoadToCustomer = useMemo(() => {
    if (!hasRealRoute) return null;
    const route = remainingRealRoute.length >= 2 ? remainingRealRoute : realRoutePoints;
    const last = route[route.length - 1];
    return calculateDistanceMeters(last, customerLocation) > DESTINATION_OFF_ROUTE_CONNECTOR_MIN_METERS
      ? [last, customerLocation]
      : null;
  }, [customerLocation, hasRealRoute, realRoutePoints, remainingRealRoute]);
  const offRoadFromRider = useMemo(() => {
    if (!hasRealRoute || !riderRouteProjection) return null;
    // Draw the dotted connector exactly when the marker itself stays at the raw point
    // (rider genuinely off the road network). Within the snap distance the marker sits
    // on the route, so no connector is needed — they use the same threshold.
    return riderRouteProjection.offRouteMeters > RIDER_SNAP_MAX_METERS
      ? [resolvedRiderLocation, riderRouteProjection.point]
      : null;
  }, [hasRealRoute, riderRouteProjection, resolvedRiderLocation]);

  const displayDistanceMeters = hasRouteDetour
    ? distanceMeters
    : routeDistanceMeters ?? distanceMeters;
  const proximityDistanceMeters = distanceMeters;
  const displayEtaMinutes =
    hasRouteDetour
      ? Math.max(1, Math.ceil(distanceMeters / 80))
      : typeof routeDurationMinutes === "number" &&
          Number.isFinite(routeDurationMinutes)
        ? Math.max(1, Math.round(routeDurationMinutes))
        : null;
  const displayDistanceText = formatDistance(displayDistanceMeters);
  const etaText = formatEta(displayEtaMinutes);
  const routeProviderText =
    hasRouteDetour
      ? "Nearby route"
      : routeProvider === "google"
      ? trafficAware
        ? "Live traffic"
        : "Road route"
      : "Straight estimate";
  const cameraBand = useMemo(
    () => getTrackingCameraBand(proximityDistanceMeters),
    [proximityDistanceMeters],
  );
  const viewportRegion = useMemo(() => {
    const region = getTrackingViewportRegion(
      resolvedRiderLocation,
      customerLocation,
      proximityDistanceMeters,
    );
    const zoomOutFactor = hasRouteDetour ? 1.12 : 1.06;

    return {
      ...region,
      latitudeDelta: region.latitudeDelta * zoomOutFactor,
      longitudeDelta: region.longitudeDelta * zoomOutFactor,
    };
  }, [
    customerLocation,
    hasRouteDetour,
    proximityDistanceMeters,
    resolvedRiderLocation,
  ]);
  const initialViewportRegion = useMemo(() => {
    const region = getTrackingViewportRegion(
      routeAnchorLocation,
      customerLocation,
      calculateDistanceMeters(routeAnchorLocation, customerLocation),
    );

    return {
      ...region,
      latitudeDelta: region.latitudeDelta * 1.06,
      longitudeDelta: region.longitudeDelta * 1.06,
    };
  }, [customerLocation, routeAnchorLocation]);
  const cameraSignature = useMemo(
    () =>
      [
        cameraBand,
        viewportRegion.latitude.toFixed(5),
        viewportRegion.longitude.toFixed(5),
        viewportRegion.latitudeDelta.toFixed(5),
        viewportRegion.longitudeDelta.toFixed(5),
      ].join("|"),
    [cameraBand, viewportRegion],
  );
  const isNearby =
    status === "PickedUp" &&
    proximityDistanceMeters <= TRACKING_NEARBY_DISTANCE_METERS &&
    proximityDistanceMeters > TRACKING_ARRIVED_DISTANCE_METERS;
  const isArriving =
    status === "PickedUp" &&
    proximityDistanceMeters <= TRACKING_ARRIVED_DISTANCE_METERS;
  const statusChipCopy = useMemo(() => {
    if (status === "Delivered") {
      return {
        label: "Delivered",
        detail: "Order reached your address",
      };
    }

    if (isArriving) {
      return {
        label: "Arriving now",
        detail: `${riderName} is at your address`,
      };
    }

    if (isNearby) {
      return {
        label: "Nearby",
        detail: "",
      };
    }

    if (status === "PickedUp") {
      return {
        label: "On the way",
        detail: "",
      };
    }

    if (status === "Preparing") {
      return {
        label: "Preparing",
        detail: "Rider will move after pickup",
      };
    }

    return {
      label: "Getting ready",
      detail: "Waiting for restaurant handoff",
    };
  }, [
    isArriving,
    isNearby,
    riderName,
    status,
  ]);

  // Frame the whole route — every point of the polyline plus both markers — so the
  // map is positioned by the actual path, not just the two pins. fitToCoordinates
  // keeps the rider, the road it is following, and the destination all in view.
  const fitCameraToRoute = useCallback(
    (animated: boolean) => {
      const points =
        remainingRoute.length >= 2
          ? remainingRoute
          : [resolvedRiderLocation, customerLocation];
      const region = getCameraRegion([
        ...points,
        resolvedRiderLocation,
        customerLocation,
      ]);
      mapRef.current?.animateToRegion(region, animated ? 700 : 1);
    },
    [customerLocation, remainingRoute, resolvedRiderLocation],
  );

  useEffect(() => {
    const shouldFollowRider = status === "PickedUp" || status === "Delivered";

    if (!mapReadyRef.current || !shouldFollowRider) {
      return;
    }

    if (lastCameraSignatureRef.current === cameraSignature) {
      return;
    }

    lastCameraSignatureRef.current = cameraSignature;
    fitCameraToRoute(true);
  }, [cameraSignature, fitCameraToRoute, status]);

  useEffect(() => {
    const nextState = isArriving ? "arriving" : isNearby ? "nearby" : "default";

    if (lastProximityStateRef.current === nextState) {
      return;
    }

    if (nextState === "nearby") {
      void Haptics.selectionAsync().catch(() => undefined);
    }

    if (nextState === "arriving") {
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    }

    lastProximityStateRef.current = nextState;
  }, [isArriving, isNearby]);

  return (
    <View style={styles.card}>
      <View style={[styles.mapWrap, { height: mapHeight }]}>
        <MapView
          key={`${mapStyleSignature}-${TRACKING_MAP_VISUAL_VERSION}`}
          ref={mapRef}
          style={styles.map}
          initialRegion={initialViewportRegion}
          showsCompass={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          scrollEnabled={false}
          zoomEnabled={false}
          minZoomLevel={13}
          maxZoomLevel={20}
          customMapStyle={resolvedMapStyle}
          onMapReady={() => {
            mapReadyRef.current = true;
            lastCameraSignatureRef.current = cameraSignature;
            fitCameraToRoute(false);
          }}
        >
          {/* Solid line for a real road route; dotted when we only have a
              straight-line estimate (no road route = treat as off-road). No white
              outline/border underneath. */}
          <Polyline
            coordinates={remainingRoute}
            strokeColor={hasRealRoute ? FOODPANDA_PINK : ESTIMATED_ROUTE}
            strokeWidth={hasRealRoute ? 4 : 3}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={hasRealRoute ? undefined : [8, 8]}
          />
          {offRoadFromRider ? (
            <Polyline
              coordinates={offRoadFromRider}
              strokeColor={FOODPANDA_PINK}
              strokeWidth={3}
              lineDashPattern={[3, 9]}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
          {offRoadToCustomer ? (
            <Polyline
              coordinates={offRoadToCustomer}
              strokeColor={FOODPANDA_PINK}
              strokeWidth={3}
              lineDashPattern={[3, 9]}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}

          <Marker
            key="customer-location"
            coordinate={customerLocation}
            anchor={{ x: 0.5, y: 0.78 }}
            identifier="customer-location"
            title="Your location"
            zIndex={3}
            tracksViewChanges={tracksViewChanges}
          >
            <HomeMarkerContent />
          </Marker>

          <MarkerAnimated
            key="deliveryman-location"
            coordinate={riderAnimatedCoordinate as never}
            anchor={{ x: 0.5, y: 0.78 }}
            identifier="deliveryman-location"
            title={riderName}
            zIndex={4}
            tracksViewChanges={tracksViewChanges}
          >
            <RiderMarkerContent />
          </MarkerAnimated>
        </MapView>
      </View>

      <View style={styles.statusFooter}>
        <View
          style={[
            styles.infoPanel,
            isNearby && styles.infoPanelNearby,
            isArriving && styles.infoPanelArriving,
          ]}
        >
          <View style={styles.infoPanelTop}>
            <View
              style={[
                styles.statusIconWrap,
                isArriving && styles.statusIconWrapArriving,
                isNearby && styles.statusIconWrapNearby,
              ]}
            >
              <View style={[styles.liveDot, isNearby && styles.liveDotNearby]} />
              <Ionicons
                name={status === "Delivered" ? "checkmark-done" : "navigate-outline"}
                size={17}
                color={
                  isArriving
                    ? palette.primary
                    : isNearby
                      ? FOODPANDA_PINK
                      : palette.foreground
                }
              />
            </View>

            <View style={styles.infoCopy}>
              <Text style={styles.infoEyebrow}>{routeProviderText}</Text>
              <Text
                style={[
                  styles.infoTitle,
                  isNearby && styles.infoTitleNearby,
                  isArriving && styles.infoTitleArriving,
                ]}
              >
                {statusChipCopy.label}
              </Text>
              {statusChipCopy.detail ? (
                <Text style={styles.infoDetail}>{statusChipCopy.detail}</Text>
              ) : null}
            </View>

            <View style={styles.etaBubble}>
              <Text style={styles.etaBubbleValue}>{etaText}</Text>
            </View>
          </View>

          <View style={styles.infoStatsRow}>
            <View style={styles.infoStatSingle}>
              <View style={styles.infoStatIconWrap}>
                <Ionicons name="navigate-outline" size={16} color={FOODPANDA_PINK} />
              </View>
              <View style={styles.infoStatCopy}>
                <Text style={styles.infoStatValue}>{displayDistanceText} away</Text>
                <Text style={styles.infoStatLabel}>Deliveryman to you</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: palette.surface,
    overflow: "hidden",
    shadowColor: palette.shadow,
    shadowOpacity: 0.75,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  mapWrap: {
    overflow: "hidden",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: "#F7F8F4",
  },
  map: {
    flex: 1,
  },
  statusFooter: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: palette.surface,
  },
  infoPanel: {
    minHeight: 124,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255, 43, 133, 0.14)",
    shadowColor: palette.shadow,
    shadowOpacity: 0.36,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    gap: 12,
  },
  infoPanelNearby: {
    backgroundColor: "#FFF0F6",
    borderColor: "rgba(255, 43, 133, 0.24)",
  },
  infoPanelArriving: {
    backgroundColor: "#FFF4EE",
    borderColor: "rgba(255, 122, 89, 0.22)",
  },
  infoPanelTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF4F8",
    position: "relative",
  },
  statusIconWrapNearby: {
    backgroundColor: "#FFFFFF",
  },
  statusIconWrapArriving: {
    backgroundColor: "#FFF1E9",
  },
  liveDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: palette.successText,
    borderWidth: 1,
    borderColor: "#fff",
  },
  liveDotNearby: {
    backgroundColor: FOODPANDA_PINK,
  },
  infoCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  infoEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    color: FOODPANDA_PINK,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  infoTitle: {
    fontSize: 18,
    lineHeight: 23,
    color: palette.foreground,
    fontWeight: "900",
  },
  infoTitleNearby: {
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "900",
    color: FOODPANDA_PINK,
  },
  infoTitleArriving: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    color: palette.primary,
  },
  infoDetail: {
    fontSize: 12,
    lineHeight: 17,
    color: palette.mutedForeground,
    fontWeight: "700",
  },
  etaBubble: {
    minWidth: 68,
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1F2430",
  },
  etaBubbleValue: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
    color: "#fff",
  },
  infoStatsRow: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFF7FB",
    flexDirection: "row",
    alignItems: "center",
  },
  infoStatSingle: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoStatIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  infoStatCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  infoStatValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
    color: palette.foreground,
  },
  infoStatLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    color: palette.mutedForeground,
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
  mapMarkerPin: {
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
  customerMarkerPin: {
    backgroundColor: palette.foreground,
  },
  riderMarkerPin: {
    backgroundColor: RIDER_PIN_YELLOW,
  },
});
