import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { palette } from "@/src/theme/palette";

type IconName = keyof typeof Ionicons.glyphMap;

// The app-wide round header button (back / share / heart / search / filter …). One place to
// restyle every screen's header actions. `active` = amber fill (e.g. filters applied).
export function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  badge,
  active = false,
  disabled = false,
  iconColor,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  /** Small count bubble (e.g. active filters). Hidden when 0/undefined. */
  badge?: number;
  active?: boolean;
  disabled?: boolean;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      style={({ pressed }) => [
        styles.button,
        active ? styles.buttonActive : null,
        disabled ? styles.buttonDisabled : null,
        pressed ? styles.buttonPressed : null,
        style,
      ]}
    >
      <Ionicons
        name={icon}
        size={19}
        color={iconColor ?? (active ? palette.onPrimary : palette.foreground)}
      />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Standard back button — `router.back()` unless an `onPress` override is given. */
export function HeaderBackButton({
  onPress,
  style,
}: {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  return (
    <HeaderIconButton
      icon="arrow-back"
      accessibilityLabel="Go back"
      onPress={onPress ?? (() => router.back())}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E6E6E6",
    backgroundColor: palette.surface,
  },
  buttonActive: {
    borderColor: palette.primary,
    backgroundColor: palette.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.foreground,
    borderWidth: 1.5,
    borderColor: palette.surface,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: palette.surface,
  },
});
