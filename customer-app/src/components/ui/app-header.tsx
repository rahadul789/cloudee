import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { HeaderBackButton } from "@/src/components/ui/header-icon-button";
import { palette } from "@/src/theme/palette";

// The app-wide screen header (same pattern as the restaurant-details sticky bar):
// [round back] [title / subtitle — or custom `center` content like a search field] [actions]
// on a white bar with a hairline bottom border. Every screen that uses it changes together.
export function AppHeader({
  title,
  subtitle,
  eyebrow,
  showBack = true,
  onBack,
  right,
  center,
  bordered = true,
  inline = false,
  style,
}: {
  title?: string;
  subtitle?: string;
  /** Small label above the title (e.g. "Favorites"). */
  eyebrow?: string;
  showBack?: boolean;
  onBack?: () => void;
  /** Action buttons on the right (use HeaderIconButton). */
  right?: ReactNode;
  /** Replaces the title block, e.g. a SearchField. */
  center?: ReactNode;
  bordered?: boolean;
  /** Inside an already-padded screen container: no side padding, no border. */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.bar,
        bordered && !inline ? styles.barBordered : null,
        inline ? styles.barInline : null,
        style,
      ]}
    >
      {showBack ? <HeaderBackButton onPress={onBack} /> : null}
      <View style={styles.center}>
        {center ?? (
          <>
            {eyebrow ? (
              <Text style={styles.eyebrow} numberOfLines={1}>
                {eyebrow}
              </Text>
            ) : null}
            {title ? (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: palette.surface,
  },
  barInline: {
    paddingHorizontal: 0,
    minHeight: 52,
    backgroundColor: "transparent",
  },
  barBordered: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E3E4E6",
  },
  center: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "500",
    color: palette.secondary,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: palette.foreground,
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "400",
    color: palette.mutedForeground,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
