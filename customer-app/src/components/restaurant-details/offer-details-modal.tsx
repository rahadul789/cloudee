import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { formatCurrency } from "@/src/lib/currency";
import { palette } from "@/src/theme/palette";

export type OfferPreview = {
  kind: "voucher" | "menu_deal";
  /** Headline value, e.g. "20% off", "৳50 off", "Free delivery". */
  valueLabel: string;
  name: string;
  mode: "auto" | "coupon";
  code?: string | null;
  minimumOrderAmount?: number | null;
  maximumDiscountAmount?: number | null;
  /** Menu deals: which items it covers ("All menu items" / "Selected items"). */
  scopeLabel?: string | null;
};

type RuleRow = { icon: keyof typeof Ionicons.glyphMap; label: string; value: string };

function buildRules(offer: OfferPreview): RuleRow[] {
  const rows: RuleRow[] = [];
  if (offer.kind === "menu_deal") {
    rows.push({
      icon: "pricetags-outline",
      label: "Applies to",
      value: offer.scopeLabel || "Selected menu items",
    });
    rows.push({
      icon: "flash-outline",
      label: "How it works",
      value: "Already taken off the item prices — just add to cart",
    });
  } else {
    rows.push({
      icon: offer.mode === "coupon" ? "keypad-outline" : "flash-outline",
      label: "How to use",
      value:
        offer.mode === "coupon" && offer.code
          ? "Enter the code at checkout"
          : "Applied automatically at checkout",
    });
    rows.push({
      icon: "basket-outline",
      label: "Minimum order",
      value:
        typeof offer.minimumOrderAmount === "number" && offer.minimumOrderAmount > 0
          ? formatCurrency(offer.minimumOrderAmount)
          : "No minimum",
    });
  }
  if (typeof offer.maximumDiscountAmount === "number" && offer.maximumDiscountAmount > 0) {
    rows.push({
      icon: "shield-checkmark-outline",
      label: "Max discount",
      value: formatCurrency(offer.maximumDiscountAmount),
    });
  }
  return rows;
}

// Modern "ticket" offer sheet: amber stub with the big value, a perforated tear line, the
// coupon code (if any) and a short rules list. Rises from the bottom; tap outside to close.
export function OfferDetailsModal({
  offer,
  onClose,
}: {
  offer: OfferPreview | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!offer) return;
    rise.setValue(0);
    Animated.spring(rise, {
      toValue: 1,
      friction: 9,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [offer, rise]);

  const kindLabel =
    offer?.kind === "menu_deal"
      ? "Menu deal"
      : offer?.mode === "coupon"
        ? "Coupon"
        : "Auto-applied";

  return (
    <Modal visible={Boolean(offer)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close offer" />
        {offer ? (
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
              {
                opacity: rise,
                transform: [
                  {
                    translateY: rise.interpolate({
                      inputRange: [0, 1],
                      outputRange: [60, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.handle} />

            <View style={styles.ticket}>
              <View style={styles.stub}>
                <View style={styles.stubGlow} />
                <View style={styles.stubTop}>
                  <View style={styles.kindPill}>
                    <Ionicons
                      name={
                        offer.kind === "menu_deal"
                          ? "pricetags"
                          : offer.mode === "coupon"
                            ? "ticket"
                            : "flash"
                      }
                      size={12}
                      color={palette.onPrimary}
                    />
                    <Text style={styles.kindText}>{kindLabel}</Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    hitSlop={10}
                    style={styles.close}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={18} color={palette.onPrimary} />
                  </Pressable>
                </View>
                <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
                  {offer.valueLabel.toUpperCase()}
                </Text>
                {offer.name ? (
                  <Text style={styles.name} numberOfLines={2}>
                    {offer.name}
                  </Text>
                ) : null}
              </View>

              <View style={styles.tearRow}>
                <View style={[styles.notch, styles.notchLeft]} />
                <View style={styles.tearLine} />
                <View style={[styles.notch, styles.notchRight]} />
              </View>

              <View style={styles.body}>
                {offer.kind === "voucher" && offer.mode === "coupon" && offer.code ? (
                  <View style={styles.codeBox}>
                    <Text style={styles.codeLabel}>Your code</Text>
                    <Text style={styles.code} selectable>
                      {offer.code}
                    </Text>
                  </View>
                ) : null}

                {buildRules(offer).map((row) => (
                  <View key={row.label} style={styles.rule}>
                    <View style={styles.ruleIcon}>
                      <Ionicons name={row.icon} size={15} color={palette.secondary} />
                    </View>
                    <View style={styles.ruleCopy}>
                      <Text style={styles.ruleLabel}>{row.label}</Text>
                      <Text style={styles.ruleValue}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.cta, pressed ? styles.ctaPressed : null]}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>Got it</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

const SHEET_BG = "#FFFFFF";

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(17,17,17,0.5)" },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 14,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: SHEET_BG,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E3E4E6",
  },
  ticket: {
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
    overflow: "hidden",
  },
  stub: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
    gap: 4,
    overflow: "hidden",
    backgroundColor: palette.primary,
  },
  stubGlow: {
    position: "absolute",
    right: -40,
    top: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  stubTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kindPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  kindText: { fontSize: 11.5, lineHeight: 15, fontWeight: "700", color: palette.onPrimary },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  value: {
    marginTop: 6,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: palette.onPrimary,
  },
  name: { fontSize: 14, lineHeight: 19, fontWeight: "500", color: "rgba(17,17,17,0.75)" },
  // Perforation: dashed line with two half-circle "bites" in the sheet colour.
  tearRow: { height: 20, justifyContent: "center", backgroundColor: palette.surface },
  tearLine: {
    marginHorizontal: 18,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#E9D2A8",
  },
  notch: {
    position: "absolute",
    top: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: SHEET_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E6E6E6",
  },
  notchLeft: { left: -10 },
  notchRight: { right: -10 },
  body: { paddingHorizontal: 18, paddingBottom: 18, gap: 12 },
  codeBox: {
    alignItems: "center",
    gap: 2,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: palette.primary,
    backgroundColor: "#FFF8EC",
  },
  codeLabel: { fontSize: 11.5, lineHeight: 15, fontWeight: "500", color: palette.mutedForeground },
  code: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: 2,
    color: palette.foreground,
  },
  rule: { flexDirection: "row", alignItems: "center", gap: 12 },
  ruleIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF4E0",
  },
  ruleCopy: { flex: 1, gap: 1 },
  ruleLabel: { fontSize: 12, lineHeight: 16, fontWeight: "400", color: palette.mutedForeground },
  ruleValue: { fontSize: 14, lineHeight: 19, fontWeight: "500", color: palette.foreground },
  cta: {
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  ctaPressed: { backgroundColor: palette.primaryPressed },
  ctaText: { fontSize: 15.5, lineHeight: 20, fontWeight: "700", color: palette.onPrimary },
});
