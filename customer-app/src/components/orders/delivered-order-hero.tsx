import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

// Delivered order header: success mark, when it arrived, restaurant +
// item count, total with payment, then Reorder + Rate/Help.
export function DeliveredOrderHero({
  orderLabel,
  restaurantName,
  itemCount,
  totalLabel,
  paymentLabel,
  deliveredAtLabel,
  reordering,
  canRate,
  onReorder,
  onRate,
  onHelp,
}: {
  /** "#FB-1234" — shown under "Delivered" (the header no longer repeats it). */
  orderLabel?: string;
  restaurantName: string;
  itemCount: number;
  totalLabel: string;
  paymentLabel: string;
  deliveredAtLabel?: string | null;
  reordering: boolean;
  canRate: boolean;
  onReorder: () => void;
  onRate: () => void;
  onHelp: () => void;
}) {
  const timing = deliveredAtLabel ? `Arrived ${deliveredAtLabel}` : "";

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.check}>
          <Ionicons name="checkmark" size={26} color="#FFFFFF" />
        </View>
        <View style={styles.topCopy}>
          <Text style={styles.title}>Delivered</Text>
          {orderLabel ? <Text style={styles.orderLabel}>Order {orderLabel}</Text> : null}
          {timing ? <Text style={styles.timing}>{timing}</Text> : null}
        </View>
      </View>

      <View style={styles.infoRow}>
        <View style={styles.infoCopy}>
          <Text style={styles.restaurant} numberOfLines={1}>
            {restaurantName}
          </Text>
          <Text style={styles.meta}>
            {itemCount} item{itemCount === 1 ? "" : "s"} · {paymentLabel}
          </Text>
        </View>
        <Text style={styles.total}>{totalLabel}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={onReorder}
          disabled={reordering}
          style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null, reordering ? styles.disabled : null]}
          accessibilityRole="button"
        >
          {reordering ? (
            <ActivityIndicator size="small" color={palette.onPrimary} />
          ) : (
            <>
              <Ionicons name="refresh" size={17} color={palette.onPrimary} />
              <Text style={styles.primaryText}>Reorder</Text>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={canRate ? onRate : onHelp}
          style={({ pressed }) => [styles.secondary, pressed ? styles.pressed : null]}
          accessibilityRole="button"
        >
          <Ionicons name={canRate ? "star" : "headset-outline"} size={16} color={canRate ? palette.amber : palette.foreground} />
          <Text style={styles.secondaryText}>{canRate ? "Rate order" : "Get help"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    padding: 18,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  top: { flexDirection: "row", alignItems: "center", gap: 14 },
  check: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16A34A",
  },
  topCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 22, fontWeight: "700", color: palette.foreground },
  orderLabel: { fontSize: 13.5, fontWeight: "700", color: palette.foreground },
  timing: { fontSize: 13, color: palette.mutedForeground },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E3E4E7",
  },
  infoCopy: { flex: 1, minWidth: 0, gap: 2 },
  restaurant: { fontSize: 16, fontWeight: "700", color: palette.foreground },
  meta: { fontSize: 12.5, color: palette.mutedForeground },
  total: { fontSize: 20, fontWeight: "700", color: palette.foreground },
  actions: { flexDirection: "row", gap: 10 },
  primary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: palette.primary,
  },
  primaryText: { fontSize: 15, fontWeight: "700", color: palette.onPrimary },
  secondary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D5D7DB",
  },
  secondaryText: { fontSize: 15, fontWeight: "700", color: palette.foreground },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.6 },
});
