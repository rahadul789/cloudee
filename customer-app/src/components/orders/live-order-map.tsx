import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

type LiveOrderMapProps = {
  customerLocation: {
    latitude: number;
    longitude: number;
  };
  restaurantLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  riderLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  status: string;
  riderName: string;
  riderAccentColor: string;
  riderVehicleIcon?: "bicycle-outline" | "rocket-outline";
};

export const LiveOrderMap = memo(function LiveOrderMap({
  customerLocation: _customerLocation,
  restaurantLocation: _restaurantLocation,
  riderLocation: _riderLocation,
  status,
  riderAccentColor,
  riderName,
  riderVehicleIcon = "bicycle-outline",
}: LiveOrderMapProps) {
  const isDelivered = status === "Delivered";

  return (
    <View style={styles.card}>
      <View style={styles.glowWarm} />
      <View style={styles.glowCool} />

      <View style={styles.routeWrap}>
        <View style={styles.endpoint}>
          <Text style={styles.endpointLabel}>You</Text>
          <View style={styles.homePin}>
            <Ionicons name="home" size={14} color="#fff" />
          </View>
        </View>

        <View style={styles.pathColumn}>
          <View style={styles.pathDot} />
          <View style={styles.pathLine} />
          <View
            style={[
              styles.riderBubble,
              {
                backgroundColor: riderAccentColor,
              },
            ]}
          >
            <Ionicons name={riderVehicleIcon} size={16} color={palette.foreground} />
            <Text style={styles.riderText}>{riderName}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.helperText}>
        {isDelivered
          ? "This order already reached your location."
          : "Live tracking preview stays fully available on the native app."}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    minHeight: 220,
    borderRadius: 28,
    overflow: "hidden",
    padding: 18,
    backgroundColor: palette.surface,
    gap: 18,
    shadowColor: palette.shadow,
    shadowOpacity: 0.75,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  glowWarm: {
    position: "absolute",
    top: -20,
    right: -18,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255, 122, 89, 0.12)",
  },
  glowCool: {
    position: "absolute",
    bottom: -24,
    left: -16,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(93, 139, 255, 0.12)",
  },
  routeWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
  },
  endpoint: {
    alignItems: "center",
    gap: 10,
  },
  endpointLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.foreground,
  },
  homePin: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
  },
  pathColumn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pathDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.secondary,
  },
  pathLine: {
    flex: 1,
    height: 2,
    backgroundColor: palette.border,
  },
  riderBubble: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  riderText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.foreground,
  },
  helperText: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.mutedForeground,
  },
});
