import { StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

export type StatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "primary"
  | "purple"
  | "teal"
  | "rose"
  | "slate";

const toneStyles: Record<StatusTone, { bg: string; text: string }> = {
  neutral: { bg: palette.surfaceMuted, text: palette.foreground },
  success: { bg: palette.successSoft, text: palette.success },
  warning: { bg: palette.warningSoft, text: palette.warning },
  danger: { bg: palette.dangerSoft, text: palette.danger },
  info: { bg: palette.infoSoft, text: palette.info },
  primary: { bg: palette.primarySoft, text: palette.primary },
  purple: { bg: "#F0EAFF", text: "#6D28D9" },
  teal: { bg: "#DFF7F3", text: "#0F766E" },
  rose: { bg: "#FFE4EF", text: "#BE123C" },
  slate: { bg: "#EEF2F6", text: "#475467" },
};

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: StatusTone;
}) {
  const colors = toneStyles[tone];

  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  text: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
});
