import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { palette } from "@/src/theme/palette";

/**
 * Lightweight "packed and ready for pickup" indicator. Replaces a heavy Lottie file
 * with a pure RN Animated icon: a soft radar pulse plus a gentle breathing scale on a
 * bag-with-checkmark badge. Both animations run on the native driver, so it stays
 * smooth with effectively zero per-frame JS work.
 */
export function ReadyForPickupIcon() {
  const pulse = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.setValue(0);
    breathe.setValue(0);
    pulseLoop.start();
    breatheLoop.start();

    return () => {
      pulseLoop.stop();
      breatheLoop.stop();
    };
  }, [breathe, pulse]);

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.75, 1.65],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0.42, 0.16, 0],
  });
  const badgeScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.07],
  });

  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel="Order packed and ready for pickup">
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
      />
      <Animated.View style={[styles.badge, { transform: [{ scale: badgeScale }] }]}>
        <Ionicons name="bag-check" size={48} color={palette.surface} />
      </Animated.View>
    </View>
  );
}

const RING_SIZE = 132;
const BADGE_SIZE = 104;

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    height: 168,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: palette.secondary,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.secondary,
    shadowColor: palette.secondary,
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
});
