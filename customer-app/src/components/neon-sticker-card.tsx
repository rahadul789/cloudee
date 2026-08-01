import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";

// Reusable dark-neon "sticker" card for the app's special / celebratory / status
// moments (priority delivery, unlocked rewards, savings, referrals…). Deliberately bold
// so it should stay RARE — one spotlight per screen at most.
//
// The only motion is a single native-driver (UI-thread) "breathing glow" behind the
// badge. It never touches the JS thread, stops + resets on unmount, and — crucially —
// PAUSES whenever its screen is not focused (`useIsFocused`), so leaving the screen never
// leaves it animating in the background. Pass `animated={false}` to render it fully static.

export type NeonAccent = "amber" | "green" | "pink";

const ACCENTS: Record<NeonAccent, { color: string; onColor: string }> = {
  // amber = priority / urgent, green = savings / unlocked, pink = referral / social.
  amber: { color: "#FFC94D", onColor: "#1B1426" },
  green: { color: "#35D6A4", onColor: "#0C241C" },
  pink: { color: "#FF6392", onColor: "#2A0F1A" },
};

export function NeonStickerCard({
  accent = "amber",
  icon = "flash",
  eyebrow,
  title,
  body,
  animated = true,
  style,
}: {
  accent?: NeonAccent;
  icon?: keyof typeof Ionicons.glyphMap;
  eyebrow?: string;
  title: string;
  body?: string;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const { color, onColor } = ACCENTS[accent];
  const isFocused = useIsFocused();
  // Only breathe while the screen is actually focused; leaving the screen pauses it.
  const shouldAnimate = animated && isFocused;

  useEffect(() => {
    if (!shouldAnimate) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();

    return () => {
      animation.stop();
      pulse.stopAnimation();
      pulse.setValue(0);
    };
  }, [pulse, shouldAnimate]);

  const glowStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.12] }),
    transform: [
      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) },
    ],
  };
  const badgeStyle = {
    transform: [
      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
    ],
  };

  return (
    <View
      style={[styles.card, { borderColor: `${color}59`, shadowColor: color }, style]}
    >
      <View style={styles.badgeWrap}>
        <Animated.View
          style={[styles.glow, { backgroundColor: color }, animated ? glowStyle : null]}
        />
        <Animated.View
          style={[styles.badge, { backgroundColor: color }, animated ? badgeStyle : null]}
        >
          <Ionicons name={icon} size={20} color={onColor} />
        </Animated.View>
      </View>
      <View style={styles.copy}>
        {eyebrow ? (
          <View style={[styles.eyebrowPill, { backgroundColor: `${color}29` }]}>
            <Text style={[styles.eyebrowText, { color }]}>{eyebrow}</Text>
          </View>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#211A2E",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    // Soft neon lift (kept cheap: static shadow, not animated).
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  badgeWrap: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  eyebrowPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  eyebrowText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  body: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    color: "#C9C2D6",
  },
});
