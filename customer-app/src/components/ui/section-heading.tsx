import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { palette } from "@/src/theme/palette";

type IconName = keyof typeof Ionicons.glyphMap;

// The app-wide section title: optional amber icon tile + title + count pill, optional
// subtitle, and an optional right-side text action ("See all", "Clear").
export function SectionHeading({
  title,
  subtitle,
  icon,
  count,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        {icon ? (
          <View style={styles.iconTile}>
            <Ionicons name={icon} size={15} color={palette.onPrimary} />
          </View>
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {typeof count === "number" ? <Text style={styles.count}>{count}</Text> : null}
        <View style={styles.spacer} />
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconTile: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  title: {
    flexShrink: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
    color: palette.foreground,
  },
  count: {
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: 999,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: palette.mutedForeground,
    backgroundColor: palette.surfaceMuted,
  },
  spacer: { flex: 1 },
  action: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
    color: palette.secondary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    color: palette.mutedForeground,
  },
});
