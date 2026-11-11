import { Ionicons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

const mascotImage = require("../../../assets/mascot_signin.png");

type Props = {
  title: string;
  subtitle?: string;
  /** Small step badge on the mascot (call / lock / keypad / key …). */
  icon?: keyof typeof Ionicons.glyphMap;
};

/** Shared header for every auth step (phone, password, OTP, reset, profile setup). */
export function AuthHero({ title, subtitle, icon }: Props) {
  return (
    <View style={styles.hero}>
      <View style={styles.art}>
        <Image
          source={mascotImage}
          style={styles.mascot}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        {icon ? (
          <View style={styles.badge}>
            <Ionicons name={icon} size={15} color={palette.onPrimary} />
          </View>
        ) : null}
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    gap: 14,
  },
  art: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  // full-body pose: a touch larger than the circle so the figure fills it
  mascot: {
    width: 124,
    height: 124,
  },
  badge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    borderWidth: 3,
    borderColor: palette.background,
  },
  copy: {
    alignItems: "center",
    gap: 6,
    maxWidth: 320,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
    color: palette.foreground,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.mutedForeground,
    textAlign: "center",
  },
});
