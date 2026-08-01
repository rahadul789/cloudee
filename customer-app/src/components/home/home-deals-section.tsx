import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type { PanelTheme } from "@/src/lib/panel-theme";
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
 * "Today's offer" — an admin-curated, area-based home showcase of up to MAX_HOME_DEALS
 * platform offers as "coupon" cards with a glowing accent badge and a big, clearly-readable
 * coupon CODE stamp. The whole strip follows the admin-picked colour theme (bg + accent +
 * text all move together for contrast). 1–2 offers fill the width; 3+ scroll horizontally.
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

  if (fill) {
    return (
      <View style={styles.fillRow}>
        {offers.map((offer) => (
          <NeonCouponCard key={offer.id} offer={offer} theme={theme} fill />
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stripContent}
    >
      {offers.map((offer) => (
        <NeonCouponCard key={offer.id} offer={offer} theme={theme} />
      ))}
    </ScrollView>
  );
}

function NeonCouponCard({
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

  return (
    <View
      style={[
        styles.card,
        fill ? styles.cardFill : styles.cardFixed,
        {
          backgroundColor: theme.bg,
          borderColor: theme.border,
          shadowColor: theme.glow,
        },
      ]}
    >
      <View style={styles.headRow}>
        <View style={styles.badgeWrap}>
          {/* Static accent glow behind the badge — NO animation (removed the breathing
              loop for performance on the always-visible home strip). */}
          <View style={[styles.badgeGlow, { backgroundColor: theme.glow }]} />
          <View style={[styles.badge, { backgroundColor: theme.accent }]}>
            <Ionicons
              name={isAuto ? "flash" : "ticket"}
              size={14}
              color={theme.accentOn}
            />
          </View>
        </View>
        <View style={styles.headCopy}>
          <Text style={[styles.discount, { color: theme.text }]} numberOfLines={1}>
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

      {/* Prominent, clearly-readable coupon code stamp (e.g. FOODBELA123). The code auto-
          shrinks to fit so a long code never crops, even on a half-width (2-card) row. */}
      <View style={[styles.codePill, { borderColor: theme.border }]}>
        <Text
          style={[styles.code, { color: theme.accent }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {isAuto ? "Auto-applied ⚡" : offer.code || "—"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fillRow: {
    flexDirection: "row",
    gap: 10,
  },
  stripContent: {
    gap: 10,
    paddingRight: 4,
  },
  card: {
    borderRadius: 18,
    backgroundColor: "#211A2E",
    borderWidth: 1,
    padding: 12,
    gap: 11,
    // Soft neon lift (static shadow, not animated).
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  cardFill: {
    flex: 1,
  },
  cardFixed: {
    width: 208,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badgeWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeGlow: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    opacity: 0.4,
  },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  headCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  discount: {
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
    color: "#FFFFFF",
  },
  condition: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    color: "#A79FB8",
  },
  codePill: {
    borderRadius: 11,
    borderWidth: 1,
    borderStyle: "dashed",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  code: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
});
