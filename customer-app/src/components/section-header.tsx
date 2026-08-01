import { StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

type Props = {
  title: string;
  subtitle?: string;
  /** Colour of the leading accent bar (defaults to the brand pink). */
  accentColor?: string;
  /** Optional emoji appended to the title for a playful, colourful vibe. */
  emoji?: string;
};

export function SectionHeader({
  title,
  subtitle,
  accentColor = palette.secondary,
  emoji,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      <View style={styles.textCol}>
        <Text style={styles.title}>
          {title}
          {emoji ? ` ${emoji}` : ""}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  accentBar: {
    width: 4,
    borderRadius: 999,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    color: palette.foreground,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
});
