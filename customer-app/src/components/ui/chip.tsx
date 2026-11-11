import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

type IconName = keyof typeof Ionicons.glyphMap;

// The app-wide pill chip (category tabs, filters, recent searches). Active = amber fill.
export function Chip({
  label,
  icon,
  active = false,
  onPress,
  onRemove,
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  active?: boolean;
  onPress?: () => void;
  /** Shows a small × that calls this (e.g. remove a recent search). */
  onRemove?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <View style={[styles.chip, active ? styles.chipActive : null]}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.main, pressed ? styles.pressed : null]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ selected: active }}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={14}
            color={active ? palette.onPrimary : palette.mutedForeground}
          />
        ) : null}
        <Text style={[styles.label, active ? styles.labelActive : null]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          style={styles.remove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
        >
          <Ionicons
            name="close"
            size={12}
            color={active ? palette.onPrimary : palette.mutedForeground}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: palette.surfaceMuted,
  },
  chipActive: {
    backgroundColor: palette.primary,
  },
  main: {
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    maxWidth: 180,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "500",
    color: "#2E3338",
  },
  labelActive: {
    fontWeight: "700",
    color: palette.onPrimary,
  },
  remove: {
    marginLeft: -6,
    paddingRight: 12,
    paddingLeft: 2,
    height: "100%",
    justifyContent: "center",
  },
});
