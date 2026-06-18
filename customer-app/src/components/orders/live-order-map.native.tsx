import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useMemo, useRef } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import MapView, { Marker, Polyline, type MapStyleElement } from "react-native-maps";

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
const RIDER_PIN_YELLOW = "#FFD54A";
const ROUTE_SHADOW = "rgba(255,255,255,0.94)";
const OFF_ROAD_GAP_METERS = 25;
const MAP_HEIGHT_SCREEN_RATIO = 0.54;
const ROUTE_DETOUR_DIRECT_MAX_METERS = 180;
const ROUTE_DETOUR_ROUTE_MIN_METERS = 450;
const ROUTE_DETOUR_RATIO = 4;
const TRACKING_MAP_VISUAL_VERSION = "pin-route-v5";
const RIDER_MARKER_ICON = require("../../../assets/images/android-icon-monochrome.png");

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

const RiderMarkerContent = memo(function RiderMarkerContent() {
  return (
    <View collapsable={false} pointerEvents="none" style={styles.markerRoot}>
      <View collapsable={false} style={styles.markerLiftShadow} />
      <View
        collapsable={false}
        style={[
          styles.markerPointer,
          styles.riderMarkerPin,
          { backgroundColor: RIDER_PIN_YELLOW },
        ]}
      />
      <View
        collapsable={false}
        style={[
          styles.mapMarkerPin,
          styles.riderMarkerPin,
          { backgroundColor: RIDER_PIN_YELLOW },
        ]}
      >
        <Image
          source={RIDER_MARKER_ICON}
          style={styles.riderMarkerLogo}
        />
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
  riderHeading,
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
  }, [mapStyleSignature]);

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

  const markerRenderKey = useMemo(
    () =>
      [
        TRACKING_MAP_VISUAL_VERSION,
        status,
        customerLocation.latitude.toFixed(5),
        customerLocation.longitude.toFixed(5),
        resolvedRiderLocation.latitude.toFixed(5),
        resolvedRiderLocation.longitude.toFixed(5),
        typeof riderHeading === "number" && Number.isFinite(riderHeading)
          ? Math.round(riderHeading).toString()
          : "",
        routePolyline ?? "",
      ].join("|"),
    [customerLocation, resolvedRiderLocation, riderHeading, routePolyline, status],
  );

  const realRoutePoints = useMemo(
    () => decodePolyline(routePolyline),
    [routePolyline],
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
  const hasRealRoute = realRoutePoints.length >= 2 && !hasRouteDetour;

  const remainingRoute = useMemo(() => {
    // Prefer the real road route from Google Directions when available;
    // otherwise fall back to the smooth synthetic curve. When Google returns a
    // long detour for a physically nearby rider, treat it as an off-road handoff.
    if (hasRealRoute) {
      return realRoutePoints;
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
    realRoutePoints,
    resolvedRiderLocation,
    riderLocation,
  ]);

  // When the rider/customer pin sits off the road network, the road route ends a
  // little away from the actual pin. Bridge that gap with a dotted "last metres"
  // connector so the rider clearly sees how to reach the exact point.
  const offRoadToCustomer = useMemo(() => {
    if (!hasRealRoute) return null;
    const last = realRoutePoints[realRoutePoints.length - 1];
    return calculateDistanceMeters(last, customerLocation) > OFF_ROAD_GAP_METERS
      ? [last, customerLocation]
      : null;
  }, [customerLocation, hasRealRoute, realRoutePoints]);
  const offRoadFromRider = useMemo(() => {
    if (!hasRealRoute) return null;
    const first = realRoutePoints[0];
    return calculateDistanceMeters(resolvedRiderLocation, first) > OFF_ROAD_GAP_METERS
      ? [resolvedRiderLocation, first]
      : null;
  }, [hasRealRoute, realRoutePoints, resolvedRiderLocation]);

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

  useEffect(() => {
    const shouldFollowRider = status === "PickedUp" || status === "Delivered";

    if (!mapReadyRef.current || !shouldFollowRider) {
      return;
    }

    if (lastCameraSignatureRef.current === cameraSignature) {
      return;
    }

    lastCameraSignatureRef.current = cameraSignature;
    const cameraDuration =
      cameraBand === "near" || cameraBand === "arrived" ? 560 : 720;
    mapRef.current?.animateToRegion(viewportRegion, cameraDuration);
  }, [cameraBand, cameraSignature, status, viewportRegion]);

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
            mapRef.current?.animateToRegion(viewportRegion, 1);
          }}
        >
          <Polyline
            coordinates={remainingRoute}
            strokeColor={ROUTE_SHADOW}
            strokeWidth={5.5}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={remainingRoute}
            strokeColor={FOODPANDA_PINK}
            strokeWidth={3.2}
            lineCap="round"
            lineJoin="round"
          />
          {offRoadFromRider ? (
            <Polyline
              coordinates={offRoadFromRider}
              strokeColor={FOODPANDA_PINK}
              strokeWidth={2.4}
              lineDashPattern={[2, 8]}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}
          {offRoadToCustomer ? (
            <Polyline
              coordinates={offRoadToCustomer}
              strokeColor={FOODPANDA_PINK}
              strokeWidth={2.4}
              lineDashPattern={[2, 8]}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}

          <Marker
            key={`customer-${markerRenderKey}`}
            coordinate={customerLocation}
            anchor={{ x: 0.5, y: 0.78 }}
            identifier="customer-location"
            title="Your location"
            zIndex={3}
            tracksViewChanges
          >
            <HomeMarkerContent />
          </Marker>

          <Marker
            key={`rider-${markerRenderKey}`}
            coordinate={resolvedRiderLocation}
            anchor={{ x: 0.5, y: 0.78 }}
            identifier="deliveryman-location"
            title={riderName}
            zIndex={4}
            tracksViewChanges
          >
            <RiderMarkerContent />
          </Marker>
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
    backgroundColor: FOODPANDA_PINK,
  },
  riderMarkerLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
});
