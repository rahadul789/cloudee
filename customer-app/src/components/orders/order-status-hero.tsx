import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

type Step = { key: string; label: string };

// Top of the tracking screen: the current status in big type with a tinted icon, a short
// context line, and a compact horizontal progress stepper (done = amber fill, current =
// amber ring, upcoming = grey).
export function OrderStatusHero({
  title,
  subtitle,
  icon,
  tint,
  accent,
  steps,
  currentIndex,
  amount,
  amountCaption,
  amountPaid = false,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  accent: string;
  steps: readonly Step[];
  currentIndex: number;
  /** Formatted order total, e.g. "৳420". */
  amount?: string;
  /** How it's paid, e.g. "Pay in cash on delivery" / "Paid via bKash". */
  amountCaption?: string;
  amountPaid?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.iconTile, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={22} color={accent} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Order status</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.stepper}>
        {steps.map((step, index) => {
          const done = index < currentIndex;
          const current = index === currentIndex;
          return (
            <View key={step.key} style={styles.step}>
              <View style={styles.markerRow}>
                <View
                  style={[
                    styles.bar,
                    index === 0 ? styles.barHidden : null,
                    done || current ? styles.barDone : null,
                  ]}
                />
                <View
                  style={[
                    styles.marker,
                    done ? styles.markerDone : null,
                    current ? styles.markerCurrent : null,
                  ]}
                >
                  {done ? (
                    <Ionicons name="checkmark" size={11} color={palette.onPrimary} />
                  ) : current ? (
                    <View style={styles.markerDot} />
                  ) : null}
                </View>
                <View
                  style={[
                    styles.bar,
                    index === steps.length - 1 ? styles.barHidden : null,
                    done ? styles.barDone : null,
                  ]}
                />
              </View>
              <Text
                style={[styles.stepLabel, done || current ? styles.stepLabelActive : null]}
                numberOfLines={2}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>

      {amount ? (
        <View style={styles.payRow}>
          <View style={[styles.payIcon, amountPaid ? styles.payIconPaid : null]}>
            <Ionicons
              name={amountPaid ? "checkmark-circle" : "cash-outline"}
              size={18}
              color={amountPaid ? palette.successText : palette.secondary}
            />
          </View>
          <View style={styles.payCopy}>
            <Text style={styles.payLabel}>{amountPaid ? "Total paid" : "Amount to pay"}</Text>
            {amountCaption ? (
              <Text style={styles.payCaption} numberOfLines={1}>
                {amountCaption}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.payAmount, amountPaid ? styles.payAmountPaid : null]}>
            {amount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: palette.mutedForeground },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700", color: palette.foreground },
  subtitle: { fontSize: 13, lineHeight: 18, fontWeight: "400", color: palette.mutedForeground },
  stepper: { flexDirection: "row" },
  step: { flex: 1, alignItems: "center", gap: 6 },
  markerRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "#ECECEC" },
  barHidden: { backgroundColor: "transparent" },
  barDone: { backgroundColor: palette.primary },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECECEC",
  },
  markerDone: { backgroundColor: palette.primary },
  markerCurrent: {
    backgroundColor: palette.surface,
    borderWidth: 3,
    borderColor: palette.primary,
  },
  markerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.primary },
  stepLabel: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "400",
    color: palette.mutedForeground,
    textAlign: "center",
  },
  stepLabelActive: { fontWeight: "700", color: palette.foreground },
  payRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECECEC",
  },
  payIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF4E0",
  },
  payIconPaid: { backgroundColor: palette.successSurface },
  payCopy: { flex: 1, minWidth: 0, gap: 1 },
  payLabel: { fontSize: 12.5, lineHeight: 17, fontWeight: "500", color: palette.mutedForeground },
  payCaption: { fontSize: 13.5, lineHeight: 18, fontWeight: "500", color: palette.foreground },
  payAmount: { fontSize: 22, lineHeight: 28, fontWeight: "700", color: palette.foreground },
  payAmountPaid: { color: palette.successText },
});
