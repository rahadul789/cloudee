import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  onPress: () => void;
};

export function PrimaryActionCard({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onPress,
}: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.accentOrbPrimary} />
      <View style={styles.accentOrbSecondary} />
      <View style={styles.row}>
        <View style={styles.pinWrap}>
          <Ionicons name="location" size={18} color={palette.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.actionPill}>
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={palette.primary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 34,
    backgroundColor: palette.heroBackground,
    padding: 20,
    overflow: "hidden",
    shadowColor: palette.shadow,
    shadowOpacity: 1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    zIndex: 1,
  },
  accentOrbPrimary: {
    position: "absolute",
    top: -90,
    right: -20,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: palette.heroOrbPrimary,
  },
  accentOrbSecondary: {
    position: "absolute",
    bottom: -80,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: palette.heroOrbSecondary,
  },
  pinWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: palette.heroAccentText,
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    color: palette.foreground,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "800",
    color: palette.foreground,
  },
});
