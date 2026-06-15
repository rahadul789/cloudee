import { Ionicons } from "@expo/vector-icons";
import { PropsWithChildren, useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";

import { useAppStartup } from "@/src/hooks/use-app-startup";
import { useCustomerAuthStore } from "@/src/store/auth-store";
import { useLocationStore } from "@/src/store/location-store";
import { palette } from "@/src/theme/palette";

export function AppBootstrapGate({ children }: PropsWithChildren) {
  useAppStartup();
  const pulse = useRef(new Animated.Value(0)).current;
  const isAuthHydrated = useCustomerAuthStore((state) => state.isHydrated);
  const isLocationHydrated = useLocationStore((state) => state.isHydrated);
  const isBootstrapping = !isAuthHydrated || !isLocationHydrated;

  useEffect(() => {
    if (!isBootstrapping) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [isBootstrapping, pulse]);

  if (isBootstrapping) {
    const pulseScale = pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.06],
    });
    const pulseOpacity = pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.12, 0.22],
    });

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.blobPink} />
          <View style={styles.blobYellow} />

          <View style={styles.brandCluster}>
            <View style={[styles.sideBubble, styles.sideBubbleLeft]}>
              <Ionicons name="location" size={18} color={palette.secondary} />
            </View>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.heroBubble,
                {
                  transform: [{ scale: pulseScale }],
                },
              ]}
            >
              <Ionicons name="fast-food" size={26} color={palette.surface} />
            </Animated.View>
            <View style={[styles.sideBubble, styles.sideBubbleRight]}>
              <Ionicons name="pricetag" size={18} color={palette.sky} />
            </View>
          </View>
          <Text style={styles.title}>Finding fresh bites nearby</Text>
          <Text style={styles.subtitle}>Setting up Foodbela for you</Text>

          <View style={styles.loaderRow}>
            <ActivityIndicator size="small" color={palette.secondary} />
            <Text style={styles.loaderText}>Just a moment</Text>
          </View>
        </View>
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.background,
    paddingHorizontal: 24,
  },
  card: {
    overflow: "hidden",
    width: "100%",
    maxWidth: 360,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(243, 221, 204, 0.9)",
    backgroundColor: palette.surface,
    paddingHorizontal: 24,
    paddingTop: 34,
    paddingBottom: 24,
    alignItems: "center",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  blobPink: {
    position: "absolute",
    top: -48,
    right: -44,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "#FFE0EC",
  },
  blobYellow: {
    position: "absolute",
    bottom: -54,
    left: -52,
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: "#FFF1BF",
  },
  brandCluster: {
    width: 156,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  pulseRing: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: palette.secondary,
  },
  heroBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
    shadowColor: "rgba(255, 99, 146, 0.38)",
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  sideBubble: {
    position: "absolute",
    top: 15,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  sideBubbleLeft: {
    left: 4,
    backgroundColor: "#FFE7F1",
    transform: [{ rotate: "-8deg" }],
  },
  sideBubbleRight: {
    right: 4,
    backgroundColor: "#EAF2FF",
    transform: [{ rotate: "8deg" }],
  },
  title: {
    maxWidth: 260,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: palette.foreground,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    color: palette.mutedForeground,
  },
  loaderRow: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#FFF4F8",
    borderWidth: 1,
    borderColor: "#FFE3EE",
  },
  loaderText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.foreground,
  },
});
