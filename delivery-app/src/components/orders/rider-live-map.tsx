import { Ionicons } from "@expo/vector-icons";
import { forwardRef, memo, useImperativeHandle } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

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
  routePolyline?: string | null;
  routeProvider?: "google" | "haversine" | null;
  showActiveApproachLeg?: boolean;
  showPlannedDeliveryLeg?: boolean;
  restaurantName?: string;
  customerName?: string;
  topInset?: number;
  bottomInset?: number;
  onOpenExternalNavigation?: () => void;
  mapStyle?: unknown;
};

const RiderLiveMapInner = forwardRef<RiderLiveMapHandle, RiderLiveMapProps>(function RiderLiveMap({
  phase,
  restaurantName,
  customerName,
  onOpenExternalNavigation,
}, ref) {
  useImperativeHandle(
    ref,
    () => ({
      recenter: () => undefined,
    }),
    [],
  );

  const destinationLabel =
    phase === "to_customer"
      ? customerName ?? "the customer"
      : restaurantName ?? "the restaurant";

  return (
    <View style={styles.root}>
      <View style={styles.glowWarm} />
      <View style={styles.glowCool} />
      <View style={styles.iconWrap}>
        <Ionicons name="navigate" size={26} color={palette.primary} />
      </View>
      <Text style={styles.title}>Live navigation</Text>
      <Text style={styles.subtitle}>
        Open the route to {destinationLabel} on the mobile app for full live
        directions, or launch turn-by-turn in Google Maps.
      </Text>
      {onOpenExternalNavigation ? (
        <Pressable style={styles.button} onPress={onOpenExternalNavigation}>
          <Ionicons name="navigate-outline" size={16} color="#fff" />
          <Text style={styles.buttonText}>Open in Google Maps</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

RiderLiveMapInner.displayName = "RiderLiveMap";
export const RiderLiveMap = memo(RiderLiveMapInner);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#EEF4E8",
    overflow: "hidden",
  },
  glowWarm: {
    position: "absolute",
    top: -30,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255, 122, 89, 0.14)",
  },
  glowCool: {
    position: "absolute",
    bottom: -34,
    left: -24,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255, 99, 146, 0.14)",
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    color: palette.foreground,
  },
  subtitle: {
    maxWidth: 320,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    color: palette.mutedForeground,
    fontWeight: "600",
  },
  button: {
    marginTop: 4,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.primary,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
});
