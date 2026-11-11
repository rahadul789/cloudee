import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppBottomSheet } from "@/src/components/app-bottom-sheet";
import { RemoteImage } from "@/src/components/remote-image";
import type { HypeItem } from "@/src/hooks/use-hype-api";
import { palette } from "@/src/theme/palette";

function formatWhen(item: HypeItem) {
  if (!item.startsAt) return "";
  const start = new Date(item.startsAt);
  const day = start.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (!item.endsAt) return `${day} · ${time}`;
  const end = new Date(item.endsAt);
  const sameDay = end.toDateString() === start.toDateString();
  const endTime = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return sameDay
    ? `${day} · ${time} – ${endTime}`
    : `${day} ${time} → ${end.toLocaleDateString("en-US", { day: "numeric", month: "short" })} ${endTime}`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={15} color={palette.secondary} />
      </View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

// Full details for a drop/event: every line of the description, when/where, and one button
// per attached link (in-app target, outside website), plus the reminder toggle.
export function HypeDetailsSheet({
  item,
  reminded,
  onClose,
  onOpenTarget,
  onOpenWebsite,
  onToggleReminder,
}: {
  item: HypeItem | null;
  reminded: boolean;
  onClose: () => void;
  onOpenTarget: (item: HypeItem) => void;
  onOpenWebsite: (url: string) => void;
  onToggleReminder: (item: HypeItem) => void;
}) {
  const visible = Boolean(item);
  const now = Date.now();
  const startsAt = item?.startsAt ? new Date(item.startsAt).getTime() : 0;
  const upcoming = startsAt > now;
  const hasTarget = Boolean(item && (item.ctaPath || item.restaurantId));
  const website = item?.externalUrl ?? "";
  const date = item?.startsAt ? new Date(item.startsAt) : null;

  const footer = item ? (
    <View style={styles.footer}>
      {hasTarget ? (
        <Pressable
          style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]}
          onPress={() => onOpenTarget(item)}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>
            {item.ctaLabel || (item.kind === "drop" ? "Grab the deal" : item.restaurantName ? `Order from ${item.restaurantName}` : "Open")}
          </Text>
          <Ionicons name="arrow-forward" size={16} color={palette.onPrimary} />
        </Pressable>
      ) : null}
      <View style={styles.secondaryRow}>
        {website ? (
          <Pressable
            style={({ pressed }) => [styles.secondary, pressed ? styles.pressed : null]}
            onPress={() => onOpenWebsite(website)}
            accessibilityRole="link"
            accessibilityLabel={`Visit website ${hostOf(website)}`}
          >
            <Ionicons name="open-outline" size={16} color={palette.foreground} />
            <Text style={styles.secondaryText} numberOfLines={1}>
              Visit {hostOf(website) || "website"}
            </Text>
          </Pressable>
        ) : null}
        {upcoming ? (
          <Pressable
            style={({ pressed }) => [styles.secondary, reminded ? styles.secondaryOn : null, pressed ? styles.pressed : null]}
            onPress={() => onToggleReminder(item)}
            accessibilityRole="button"
          >
            <Ionicons name={reminded ? "notifications" : "notifications-outline"} size={16} color={palette.foreground} />
            <Text style={styles.secondaryText}>{reminded ? "Reminder set" : "Remind me"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  ) : null;

  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={[0.62, 0.9]} footer={footer} showCloseButton={false}>
      {item ? (
        <View style={styles.body}>
          {item.imageUrl ? (
            <RemoteImage uri={item.imageUrl} style={styles.hero} contentFit="cover" />
          ) : (
            <View style={[styles.heroFallback, item.kind === "drop" ? styles.heroDrop : null]}>
              {date ? (
                <View style={styles.bigDate}>
                  <Text style={[styles.bigMonth, item.kind === "drop" ? styles.onDark : null]}>
                    {date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
                  </Text>
                  <Text style={[styles.bigDay, item.kind === "drop" ? styles.onDark : null]}>{date.getDate()}</Text>
                </View>
              ) : (
                <Ionicons name={item.kind === "drop" ? "flash" : "calendar"} size={40} color={palette.primary} />
              )}
            </View>
          )}

          <View style={styles.kindRow}>
            <View style={[styles.kindChip, item.kind === "drop" ? styles.kindChipDrop : null]}>
              <Ionicons
                name={item.kind === "drop" ? "flash" : "calendar"}
                size={12}
                color={item.kind === "drop" ? "#FFFFFF" : palette.secondary}
              />
              <Text style={[styles.kindText, item.kind === "drop" ? styles.onDark : null]}>
                {item.kind === "drop" ? "Drop" : "Event"}
              </Text>
            </View>
            {!upcoming && item.startsAt ? (
              <View style={styles.liveChip}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>{item.kind === "drop" ? "Live now" : "Happening now"}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.title}>{item.title}</Text>

          <View style={styles.infoList}>
            {item.startsAt ? <InfoRow icon="time-outline" text={formatWhen(item)} /> : null}
            {item.location ? <InfoRow icon="location-outline" text={item.location} /> : null}
            {item.restaurantName ? <InfoRow icon="storefront-outline" text={item.restaurantName} /> : null}
            {item.limitLabel ? <InfoRow icon="flame-outline" text={item.limitLabel} /> : null}
          </View>

          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
        </View>
      ) : null}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingBottom: 8 },
  hero: { width: "100%", aspectRatio: 16 / 9, borderRadius: 18 },
  heroFallback: {
    height: 120,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  heroDrop: { backgroundColor: "#111111" },
  bigDate: { alignItems: "center" },
  bigMonth: { fontSize: 13, fontWeight: "700", color: palette.secondary, letterSpacing: 1 },
  bigDay: { fontSize: 44, lineHeight: 50, fontWeight: "800", color: palette.foreground },
  onDark: { color: "#FFFFFF" },
  kindRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  kindChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: palette.primarySoft,
  },
  kindChipDrop: { backgroundColor: "#111111" },
  kindText: { fontSize: 12, fontWeight: "700", color: palette.secondary },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: "#E7F7EE",
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.successText },
  liveText: { fontSize: 12, fontWeight: "700", color: palette.successText },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800", color: palette.foreground },
  infoList: { gap: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primarySoft,
  },
  infoText: { flex: 1, fontSize: 14, lineHeight: 19, color: palette.foreground },
  description: { fontSize: 14.5, lineHeight: 22, color: palette.foreground },
  footer: { gap: 10 },
  primary: {
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.primary,
  },
  primaryText: { fontSize: 15, fontWeight: "700", color: palette.onPrimary },
  secondaryRow: { flexDirection: "row", gap: 10 },
  secondary: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#DADCE0",
    backgroundColor: palette.surface,
  },
  secondaryOn: { borderColor: palette.primary, backgroundColor: palette.primarySoft },
  secondaryText: { fontSize: 14, fontWeight: "700", color: palette.foreground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
