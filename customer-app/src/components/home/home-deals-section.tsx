import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import type {
  CustomerHomeDealOffer,
  CustomerHomeDealsSection,
} from "@/src/types/restaurant";

const MAX_HOME_DEALS = 6;

// A rotating vibrant palette so each offer chip keeps its own colour and pops off the soft panel.
const CHIP_THEMES = [
  "#FF2D78",
  "#7C3AED",
  "#2563EB",
  "#F97316",
  "#059669",
  "#E11D48",
];

// Show taka as "Tk …" like the rest of the app (formatCurrency), not the ৳ the backend puts in.
function toTk(text: string) {
  return text.replace(/৳\s?/g, "Tk ");
}

/**
 * "Today's offer" — an admin-curated, area-based home showcase of up to MAX_HOME_DEALS platform
 * offers, rendered as vibrant chips on a soft panel with a single colour orb on each side (a clean,
 * modern backdrop, no heading). Each chip shows the discount + condition on one line and a
 * prominent white code stamp (ticket icon so it reads as a code) / AUTO badge. Up to 3 offers fill
 * the width (1 = full, 2 = halves — the common case, 3 = thirds); 4+ scroll horizontally.
 */
export function HomeDealsSection({
  section,
}: {
  section?: CustomerHomeDealsSection | null;
}) {
  if (!section?.enabled || !section.offers?.length) return null;
  const offers = section.offers.slice(0, MAX_HOME_DEALS);
  // 1–2 offers fill the width (1 = full, 2 = halves — the common case); 3+ scroll at their natural
  // width so the cards never get squeezed thin.
  const fill = offers.length <= 2;

  return (
    <View style={styles.section}>
      {/* One soft colour orb on each side — a calm, modern two-tone wash. */}
      <View style={[styles.orb, styles.orbLeft]} />
      <View style={[styles.orb, styles.orbRight]} />

      {fill ? (
        <View style={styles.fillRow}>
          {offers.map((offer, index) => (
            <OfferChip
              key={offer.id}
              offer={offer}
              color={CHIP_THEMES[index % CHIP_THEMES.length]}
              fill
            />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripContent}
        >
          {offers.map((offer, index) => (
            <OfferChip
              key={offer.id}
              offer={offer}
              color={CHIP_THEMES[index % CHIP_THEMES.length]}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function OfferChip({
  offer,
  color,
  fill,
}: {
  offer: CustomerHomeDealOffer;
  color: string;
  fill?: boolean;
}) {
  const isAuto = offer.type === "auto";
  const condition =
    offer.minimumOrderAmount > 0
      ? `Min. Tk ${offer.minimumOrderAmount}`
      : "No minimum";

  return (
    <View
      style={[
        styles.chip,
        fill ? styles.chipFill : styles.chipFixed,
        { backgroundColor: color },
      ]}
    >
      <View style={styles.topRow}>
        <Text style={styles.discount} numberOfLines={1}>
          {toTk(offer.discountLabel)}
        </Text>
        <Text style={styles.condition} numberOfLines={1}>
          {condition}
        </Text>
      </View>

      {isAuto ? (
        <View style={styles.stamp}>
          <Ionicons name="flash" size={10} color={color} />
          <Text style={[styles.codeText, { color }]} numberOfLines={1}>
            AUTO
          </Text>
        </View>
      ) : (
        <View style={styles.stamp}>
          <Ionicons name="ticket-outline" size={10} color={color} />
          <Text style={[styles.codeText, { color }]} numberOfLines={1}>
            {offer.code || "—"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#FBF3FF",
    borderWidth: 1,
    borderColor: "#EFE6FA",
    paddingVertical: 10,
  },
  orb: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 999,
    opacity: 0.2,
  },
  orbLeft: {
    backgroundColor: "#8B5CF6",
    top: -52,
    left: -58,
  },
  orbRight: {
    backgroundColor: "#2563EB",
    bottom: -60,
    right: -54,
  },
  fillRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 9,
  },
  stripContent: {
    paddingHorizontal: 12,
    gap: 9,
  },
  chip: {
    justifyContent: "center",
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 5,
  },
  chipFixed: {
    // Size to content with a floor — a longer code / condition widens the chip instead of squeezing
    // or shrinking the text, but a short offer never gets a tiny cramped chip.
    minWidth: 150,
  },
  chipFill: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  discount: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: -0.2,
    color: "#FFFFFF",
  },
  condition: {
    flexShrink: 1,
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
  },
  // White "stamp" so the code pops off the colour chip; the ticket icon makes it read as a code, and
  // the code is bigger + bolder than the surrounding copy.
  stamp: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  codeText: {
    flexShrink: 1,
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
});
