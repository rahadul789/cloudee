import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import type { RiderDelaySignal } from "@/src/lib/rider-delay-display";
import { palette } from "@/src/theme/palette";

type Props = {
  signal: RiderDelaySignal | null;
};

function getToneColors(tone: RiderDelaySignal["tone"]) {
  if (tone === "critical") {
    return {
      backgroundColor: palette.dangerSoft,
      borderColor: "#FECACA",
      color: palette.danger,
      iconBackground: "#FFFFFF",
    };
  }

  if (tone === "late") {
    return {
      backgroundColor: "#FFF0F6",
      borderColor: "#FFCEE0",
      color: palette.secondary,
      iconBackground: "#FFFFFF",
    };
  }

  return {
    backgroundColor: palette.warningSurface,
    borderColor: "#FDE68A",
    color: palette.warningText,
    iconBackground: "#FFFFFF",
  };
}

export function RiderDelayBanner({ signal }: Props) {
  if (!signal) return null;

  const tone = getToneColors(signal.tone);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: tone.iconBackground }]}>
        <Ionicons name={signal.icon} size={15} color={tone.color} />
      </View>
      <View style={styles.copyWrap}>
        <Text style={[styles.title, { color: tone.color }]} numberOfLines={1}>
          {signal.label}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {signal.detail}
        </Text>
      </View>
      <View style={[styles.elapsedPill, { borderColor: tone.borderColor }]}>
        <Text style={[styles.elapsedText, { color: tone.color }]} numberOfLines={1}>
          {signal.elapsedLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 48,
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  iconBubble: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  copyWrap: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  detail: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
    color: palette.mutedForeground,
  },
  elapsedPill: {
    minWidth: 58,
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.62)",
  },
  elapsedText: {
    fontSize: 11,
    fontWeight: "900",
  },
});
