import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

// Pure-JS vertical fade (transparent → dark) built from thin stacked bands — no native
// gradient module, so it works on every existing build. With ~16 bands and an eased
// curve the steps are invisible on photos.
const BANDS = 16;

export const SoftGradient = memo(function SoftGradient({
  maxOpacity = 0.85,
  color = "0,0,0",
  style,
}: {
  /** Opacity at the bottom edge. */
  maxOpacity?: number;
  /** "r,g,b" of the fade colour. */
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View pointerEvents="none" style={[styles.root, style]}>
      {Array.from({ length: BANDS }, (_, index) => {
        const t = (index + 1) / BANDS;
        // ease-in: stays clear at the top, darkens faster toward the bottom
        const alpha = maxOpacity * t * t;
        return (
          <View
            key={index}
            style={[styles.band, { backgroundColor: `rgba(${color},${alpha.toFixed(3)})` }]}
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flexDirection: "column" },
  band: { flex: 1 },
});
