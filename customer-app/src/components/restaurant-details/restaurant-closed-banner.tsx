import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { getClosedCopy } from "@/src/lib/restaurant-availability";
import { palette } from "@/src/theme/palette";
import type { RestaurantAvailability } from "@/src/types/restaurant";

/**
 * Prominent closed-state banner for the restaurant detail screen. When the reopen time is
 * known (service window / schedule) it shows "Opens 11:00 AM" with an inviting coral
 * treatment and reassures that ordering resumes during opening hours; otherwise a calm
 * "Temporarily unavailable". The menu stays browsable underneath — only ordering is blocked.
 */
export function RestaurantClosedBanner({
  availability,
}: {
  availability?: RestaurantAvailability | null;
}) {
  const copy = getClosedCopy(availability);
  const opensSoon = copy.hasReopen;

  return (
    <View style={[styles.card, opensSoon ? styles.cardOpens : styles.cardBusy]}>
      <View
        style={[styles.iconWrap, opensSoon ? styles.iconWrapOpens : styles.iconWrapBusy]}
      >
        <Ionicons
          name={opensSoon ? "time" : "moon"}
          size={18}
          color={opensSoon ? palette.primary : palette.mutedForeground}
        />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, opensSoon ? styles.titleOpens : null]}>
          {copy.title}
        </Text>
        <Text style={styles.subtitle}>
          {opensSoon
            ? "You can add items to the cart and order during opening hours."
            : "This restaurant is offline right now — you can order once it's back."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  cardOpens: {
    backgroundColor: "#FFF3EE",
    borderColor: "rgba(255, 122, 89, 0.32)",
  },
  cardBusy: {
    backgroundColor: palette.surfaceMuted,
    borderColor: "rgba(20, 24, 35, 0.08)",
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapOpens: { backgroundColor: "rgba(255, 122, 89, 0.16)" },
  iconWrapBusy: { backgroundColor: "rgba(20, 24, 35, 0.06)" },
  body: { flex: 1, gap: 2 },
  title: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "800",
    color: palette.foreground,
    letterSpacing: 0.1,
  },
  titleOpens: { color: palette.heroAccentText },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: palette.mutedForeground,
  },
});
