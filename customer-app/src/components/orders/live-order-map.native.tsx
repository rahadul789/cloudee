import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

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
import { palette } from "@/src/theme/palette";

type LiveOrderMapProps = {
  customerLocation: TrackingCoordinate;
  restaurantLocation?: TrackingCoordinate | null;
  riderLocation?: TrackingCoordinate | null;
  status: string;
  riderAccentColor: string;
  riderName: string;
  riderVehicleIcon?: "bicycle-outline" | "rocket-outline";
};

const HomeMarkerContent = memo(function HomeMarkerContent() {
  return (
    <View collapsable={false} style={styles.markerRoot}>
      <View style={styles.customerMarkerPin}>
        <Ionicons name="home" size={13} color="#fff" />
      </View>
    </View>
  );
});

const RiderMarkerContent = memo(function RiderMarkerContent({
  riderAccentColor,
  riderVehicleIcon,
}: {
  riderAccentColor: string;
  riderVehicleIcon: "bicycle-outline" | "rocket-outline";
}) {
  return (
    <View collapsable={false} style={styles.markerRoot}>
      <View
        style={[
          styles.riderMarkerPin,
          {
            backgroundColor: riderAccentColor,
          },
        ]}
      >
        <Ionicons name={riderVehicleIcon} size={13} color={palette.foreground} />
      </View>
    </View>
  );
});

export const LiveOrderMap = memo(function LiveOrderMap({
  customerLocation,
  restaurantLocation,
  riderLocation,
  status,
  riderAccentColor,
  riderName,
  riderVehicleIcon = "bicycle-outline",
}: LiveOrderMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const mapReadyRef = useRef(false);
  const lastCameraBandRef = useRef<ReturnType<typeof getTrackingCameraBand> | null>(
    null,
  );
  const lastProximityStateRef = useRef<"default" | "nearby" | "arriving">("default");

  const [shouldTrackMarkerViews, setShouldTrackMarkerViews] = useState(true);

  useEffect(() => {
    const markerTrackingTimer = setTimeout(() => {
      setShouldTrackMarkerViews(false);
    }, 700);

    return () => {
      clearTimeout(markerTrackingTimer);
    };
  }, []);

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

  const remainingRoute = useMemo(() => {
    if (riderLocation) {
      return buildCurvedRoutePoints(riderLocation, customerLocation, 20);
    }

    return [resolvedRiderLocation, customerLocation];
  }, [customerLocation, resolvedRiderLocation, riderLocation]);

  const distanceMeters = useMemo(
    () => calculateDistanceMeters(resolvedRiderLocation, customerLocation),
    [customerLocation, resolvedRiderLocation],
  );
  const cameraBand = useMemo(
    () => getTrackingCameraBand(distanceMeters),
    [distanceMeters],
  );
  const viewportRegion = useMemo(
    () => getTrackingViewportRegion(resolvedRiderLocation, customerLocation, distanceMeters),
    [customerLocation, distanceMeters, resolvedRiderLocation],
  );
  const initialViewportRegion = useMemo(
    () =>
      getTrackingViewportRegion(
        routeAnchorLocation,
        customerLocation,
        calculateDistanceMeters(routeAnchorLocation, customerLocation),
      ),
    [customerLocation, routeAnchorLocation],
  );

  const isNearby =
    status === "PickedUp" &&
    distanceMeters <= TRACKING_NEARBY_DISTANCE_METERS &&
    distanceMeters > TRACKING_ARRIVED_DISTANCE_METERS;
  const isArriving =
    status === "PickedUp" &&
    distanceMeters <= TRACKING_ARRIVED_DISTANCE_METERS;
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
        detail: "Rider is almost at your doorstep",
      };
    }

    if (isNearby) {
      return {
        label: "Nearby",
        detail: "Rider is very close to your location",
      };
    }

    if (status === "PickedUp") {
      return {
        label: "On the way",
        detail: `${Math.max(1, Math.round(distanceMeters / 100)) / 10} km away`,
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
  }, [distanceMeters, isArriving, isNearby, status]);

  useEffect(() => {
    if (!mapReadyRef.current || status !== "PickedUp") {
      return;
    }

    if (lastCameraBandRef.current === cameraBand) {
      return;
    }

    lastCameraBandRef.current = cameraBand;
    mapRef.current?.animateToRegion(viewportRegion, 850);
  }, [cameraBand, status, viewportRegion]);

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
      <View style={styles.mapWrap}>
        <MapView
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
          maxZoomLevel={19}
          onMapReady={() => {
            mapReadyRef.current = true;
            lastCameraBandRef.current = cameraBand;
            mapRef.current?.animateToRegion(viewportRegion, 1);
          }}
        >
          <Polyline
            coordinates={remainingRoute}
            strokeColor="rgba(255,255,255,0.92)"
            strokeWidth={5}
          />
          <Polyline
            coordinates={remainingRoute}
            strokeColor={palette.secondary}
            strokeWidth={3}
            lineDashPattern={[2, 9]}
          />

          <Marker
            coordinate={customerLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={3}
            tracksViewChanges={shouldTrackMarkerViews}
          >
            <HomeMarkerContent />
          </Marker>

          <Marker
            coordinate={resolvedRiderLocation}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={4}
            tracksViewChanges={shouldTrackMarkerViews}
          >
            <RiderMarkerContent
              riderAccentColor={riderAccentColor}
              riderVehicleIcon={riderVehicleIcon}
            />
          </Marker>
        </MapView>
      </View>

      <View style={styles.statusFooter}>
        <View style={styles.statusChip}>
          <View
            style={[
              styles.statusChipIconWrap,
              isArriving && styles.statusChipIconWrapArriving,
              isNearby && styles.statusChipIconWrapNearby,
            ]}
          >
            <Ionicons
              name={status === "Delivered" ? "checkmark-done" : "time-outline"}
              size={15}
              color={
                isArriving
                  ? palette.primary
                  : isNearby
                    ? palette.successText
                    : palette.foreground
              }
            />
          </View>
          <View style={styles.statusChipCopy}>
            <Text
              style={[
                styles.statusChipLabel,
                isArriving && styles.statusChipLabelArriving,
                isNearby && styles.statusChipLabelNearby,
              ]}
            >
              {statusChipCopy.label}
            </Text>
            <Text style={styles.statusChipDetail}>{statusChipCopy.detail}</Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    backgroundColor: palette.surface,
    overflow: "hidden",
    shadowColor: palette.shadow,
    shadowOpacity: 0.75,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  mapWrap: {
    height: 228,
    overflow: "hidden",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  map: {
    flex: 1,
  },
  statusFooter: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    backgroundColor: palette.surface,
  },
  statusChip: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusChipIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  statusChipIconWrapNearby: {
    backgroundColor: "#EAF7EE",
  },
  statusChipIconWrapArriving: {
    backgroundColor: "#FFF1E9",
  },
  statusChipCopy: {
    flex: 1,
    gap: 2,
  },
  statusChipLabel: {
    fontSize: 14,
    lineHeight: 18,
    color: palette.foreground,
    fontWeight: "600",
  },
  statusChipLabelNearby: {
    color: palette.successText,
  },
  statusChipLabelArriving: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    color: palette.primary,
  },
  statusChipDetail: {
    fontSize: 11,
    lineHeight: 15,
    color: palette.mutedForeground,
    fontWeight: "600",
  },
  markerRoot: {
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
  },
  customerMarkerPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
    borderWidth: 2,
    borderColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.75,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  riderMarkerPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.75,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});
