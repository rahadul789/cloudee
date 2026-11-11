import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";
import { type as typeScale } from "@/src/theme/typography";

type Props = {
  title: string;
  subtitle?: string;
  /** Colour of the leading accent bar (defaults to the brand pink). */
  accentColor?: string;
  /** Optional emoji appended to the title for a playful, colourful vibe. */
  emoji?: string;
  /** Clean heading (no accent bar, lighter type scale) — used on the redesigned home. */
  plain?: boolean;
  /** Shows a round → button; the whole header opens the full list. */
  onSeeAll?: () => void;
};

export function SectionHeader({
  title,
  subtitle,
  accentColor = palette.secondary,
  emoji,
  plain = true,
  onSeeAll,
}: Props) {
  if (plain) {
    const copy = (
      <View style={[styles.plainWrap, onSeeAll ? styles.plainCopy : null]}>
        <Text style={typeScale.sectionTitle}>
          {title}
          {emoji ? ` ${emoji}` : ""}
        </Text>
        {subtitle ? (
          <Text style={typeScale.sectionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
    );
    if (!onSeeAll) return copy;
    // Whole row is the tap target; the round arrow makes "see all" obvious.
    return (
      <Pressable
        onPress={onSeeAll}
        style={({ pressed }) => [styles.seeAllRow, pressed ? styles.pressed : null]}
        accessibilityRole="button"
        accessibilityLabel={`See all ${title}`}
        hitSlop={4}
      >
        {copy}
        <View style={styles.seeAllButton}>
          <Ionicons name="arrow-forward" size={17} color={palette.foreground} />
        </View>
      </Pressable>
    );
  }

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
  plainWrap: {
    gap: 2,
  },
  plainCopy: {
    flex: 1,
    minWidth: 0,
  },
  seeAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  seeAllButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  pressed: {
    opacity: 0.7,
  },
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
    fontWeight: "700",
    color: palette.foreground,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
    color: palette.mutedForeground,
  },
});
