import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useNetworkStore } from "@/src/store/network-store";
import { palette } from "@/src/theme/palette";

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const isConnected = useNetworkStore((state) => state.isConnected);
  const isInternetReachable = useNetworkStore(
    (state) => state.isInternetReachable,
  );
  const slide = useRef(new Animated.Value(0)).current;

  const banner = useMemo(() => {
    if (isConnected === false || isInternetReachable === false) {
      return {
        icon: "cloud-offline-outline" as const,
        text: "You're offline. Checkout and live updates will resume when you reconnect.",
        backgroundColor: "#FFF2ED",
        borderColor: "#FFD7C7",
        iconColor: "#E56B55",
      };
    }

    if (
      (isConnected === true && isInternetReachable == null) ||
      (isConnected == null && isInternetReachable == null)
    ) {
      return {
        icon: "cellular-outline" as const,
        text: "Network looks weak. Some screens may load slowly for a moment.",
        backgroundColor: "#FFF6E3",
        borderColor: "#F6DFC0",
        iconColor: "#D58A1D",
      };
    }

    return null;
  }, [isConnected, isInternetReachable]);

  useEffect(() => {
    Animated.spring(slide, {
      toValue: banner ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
      mass: 0.7,
    }).start();
  }, [banner, slide]);

  if (!banner) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          top: insets.top + 8,
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [-26, 0],
              }),
            },
          ],
          opacity: slide,
        },
      ]}
    >
      <View
        style={[
          styles.banner,
          {
            backgroundColor: banner.backgroundColor,
            borderColor: banner.borderColor,
          },
        ]}
      >
        <Ionicons name={banner.icon} size={16} color={banner.iconColor} />
        <Text style={styles.bannerText}>{banner.text}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 18,
    right: 18,
    zIndex: 200,
  },
  banner: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: palette.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: palette.foreground,
  },
});
