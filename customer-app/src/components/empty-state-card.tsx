import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

type IconName = keyof typeof Ionicons.glyphMap;
type Tone = "default" | "error" | "offline";

// Bela mascot poses (512×512 transparent PNG, ~20 KB each).
const MASCOT = {
  signin: require("../../assets/mascot_signin.png"),
  cart: require("../../assets/mascot_empty_cart.png"),
  orders: require("../../assets/mascot_no_orders.png"),
  error: require("../../assets/mascot_error.png"),
  offline: require("../../assets/mascot_offline.png"),
} as const;
export type MascotPose = keyof typeof MASCOT;

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onPress?: () => void;
  /** Override the auto-picked icon (used when no mascot pose fits). */
  icon?: IconName;
  /** Force a mascot pose, or `false` to show an icon instead. */
  mascot?: MascotPose | false;
  /** Override the auto-picked tone (error / offline tint). */
  tone?: Tone;
};

type Visual = { tone: Tone; icon: IconName; mascot: MascotPose | false };

/**
 * Picks a sensible illustration from the copy so every existing call site gets a
 * context-aware empty state without passing props. Explicit props win.
 */
function resolveVisual(title: string, description: string): Visual {
  const text = `${title} ${description}`.toLowerCase();
  if (/offline|no internet|connection/.test(text)) {
    return { tone: "offline", icon: "cloud-offline-outline", mascot: "offline" };
  }
  if (/could not|couldn't|failed|unable|went wrong|error/.test(text)) {
    return { tone: "error", icon: "refresh-outline", mascot: "error" };
  }
  if (/sign in|signed in|log in|logged in/.test(text)) {
    return { tone: "default", icon: "person-outline", mascot: "signin" };
  }
  if (/cart/.test(text)) return { tone: "default", icon: "bag-handle-outline", mascot: "cart" };
  if (/order/.test(text)) return { tone: "default", icon: "receipt-outline", mascot: "orders" };
  if (/favou?rite|saved/.test(text)) return { tone: "default", icon: "heart-outline", mascot: "cart" };
  if (/notification|update/.test(text)) return { tone: "default", icon: "notifications-outline", mascot: false };
  if (/offer|deal|voucher|promo|coupon/.test(text)) return { tone: "default", icon: "pricetag-outline", mascot: false };
  if (/referr|invite|friend/.test(text)) return { tone: "default", icon: "people-outline", mascot: false };
  if (/search|result|match|found/.test(text)) return { tone: "default", icon: "search-outline", mascot: "error" };
  if (/menu|item|dish/.test(text)) return { tone: "default", icon: "fast-food-outline", mascot: false };
  if (/closed|open/.test(text)) return { tone: "default", icon: "time-outline", mascot: false };
  return { tone: "default", icon: "storefront-outline", mascot: false };
}

const TONE = {
  default: { bg: palette.primarySoft, fg: palette.secondary },
  error: { bg: "#FDECEF", fg: "#B4234A" },
  offline: { bg: "#EEF1F5", fg: "#4A5566" },
} as const;

export function EmptyStateCard({
  title,
  description,
  actionLabel,
  onPress,
  icon,
  mascot,
  tone,
}: Props) {
  const auto = resolveVisual(title, description);
  const resolvedTone = tone ?? auto.tone;
  const pose = mascot === undefined ? auto.mascot : mascot;
  const colors = TONE[resolvedTone];
  const isRetry = resolvedTone !== "default";

  return (
    <View style={styles.card}>
      {pose ? (
        <View style={[styles.mascotArt, { backgroundColor: colors.bg }]}>
          <Image
            source={MASCOT[pose]}
            style={styles.mascot}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : (
        <View style={[styles.art, { backgroundColor: colors.bg }]}>
          <Ionicons name={icon ?? auto.icon} size={34} color={colors.fg} />
        </View>
      )}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {actionLabel && onPress ? (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            isRetry ? styles.buttonQuiet : null,
            pressed ? styles.pressed : null,
          ]}
          onPress={onPress}
          accessibilityRole="button"
        >
          {isRetry ? <Ionicons name="refresh" size={16} color={palette.foreground} /> : null}
          <Text style={styles.buttonText}>{actionLabel}</Text>
          {!isRetry ? <Ionicons name="arrow-forward" size={16} color={palette.onPrimary} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 24,
    borderRadius: 24,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  art: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  // The poses are full-body, so give them a taller stage than the round icon art.
  mascotArt: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mascot: {
    width: 150,
    height: 150,
  },
  copy: {
    alignItems: "center",
    gap: 6,
    maxWidth: 300,
  },
  title: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: "700",
    color: palette.foreground,
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.mutedForeground,
    textAlign: "center",
  },
  button: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 2,
    paddingHorizontal: 22,
    borderRadius: 999,
    backgroundColor: palette.primary,
  },
  buttonQuiet: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: "#DADCE0",
  },
  buttonText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: palette.onPrimary,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
