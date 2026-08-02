import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { panelTileColors, type PanelTheme } from "@/src/lib/panel-theme";
import type {
  CustomerHomeDealOffer,
  CustomerHomeDealsSection,
} from "@/src/types/restaurant";

const MAX_HOME_DEALS = 6;

// Show taka as "Tk …" like the rest of the app (formatCurrency), not the ৳ the backend puts in.
function toTk(text: string) {
  return text.replace(/৳\s?/g, "Tk ");
}

/**
 * Admin-curated, area-based home showcase of up to MAX_HOME_DEALS platform offers, all inside
 * ONE full-width panel painted in the admin-picked colour theme. The compact coupon tickets sit
 * on that panel: 1–2 offers fill the width (both shown in full), 3+ scroll horizontally so the
 * peeking next card makes it obvious there's more.
 */
export function HomeDealsSection({
  section,
  theme,
}: {
  section?: CustomerHomeDealsSection | null;
  theme: PanelTheme;
}) {
  if (!section?.enabled || !section.offers?.length) return null;
  const offers = section.offers.slice(0, MAX_HOME_DEALS);
  const fill = offers.length <= 2;

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: theme.bg,
          borderColor: theme.border,
          shadowColor: theme.glow,
        },
      ]}
    >
      {fill ? (
        <View style={styles.fillRow}>
          {offers.map((offer) => (
            <CouponTicket key={offer.id} offer={offer} theme={theme} fill />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripContent}
        >
          {offers.map((offer) => (
            <CouponTicket key={offer.id} offer={offer} theme={theme} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function CouponTicket({
  offer,
  theme,
  fill,
}: {
  offer: CustomerHomeDealOffer;
  theme: PanelTheme;
  fill?: boolean;
}) {
  const isAuto = offer.type === "auto";
  const condition =
    offer.minimumOrderAmount > 0
      ? `Min. order Tk ${offer.minimumOrderAmount}`
      : "No minimum";
  const tile = panelTileColors(theme);

  return (
    <View
      style={[
        styles.ticket,
        fill ? styles.ticketFill : styles.ticketFixed,
        { backgroundColor: tile.surface, borderColor: tile.border },
      ]}
    >
      <View style={styles.ticketHead}>
        <View style={[styles.ticketBadge, { backgroundColor: theme.accent }]}>
          <Ionicons
            name={isAuto ? "flash" : "ticket"}
            size={12}
            color={theme.accentOn}
          />
        </View>
        <View style={styles.ticketCopy}>
          <Text
            style={[styles.discount, { color: theme.text }]}
            numberOfLines={1}
          >
            {toTk(offer.discountLabel)}
          </Text>
          <Text
            style={[styles.condition, { color: theme.subText }]}
            numberOfLines={1}
          >
            {condition}
          </Text>
        </View>
      </View>

      {/* Coupon code stamp — auto-shrinks to fit so the FULL code always shows (never
          cropped), even a long one like FOODBELA200 on a half-width (2-card) ticket. */}
      <View style={[styles.codePill, { borderColor: theme.accent }]}>
        <Text
          style={[styles.code, { color: theme.accent }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
        >
          {isAuto ? "Auto ⚡" : offer.code || "—"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 10,
    // Soft neon lift (static shadow, not animated).
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  fillRow: {
    flexDirection: "row",
    gap: 8,
  },
  stripContent: {
    gap: 8,
    paddingRight: 2,
  },
  ticket: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 9,
    gap: 8,
  },
  ticketFixed: {
    width: 190,
  },
  ticketFill: {
    flex: 1,
  },
  ticketHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ticketBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  ticketCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  discount: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  condition: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
  },
  codePill: {
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: "dashed",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  code: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: "900",
    letterSpacing: 0.4,
    textAlign: "center",
  },
});
