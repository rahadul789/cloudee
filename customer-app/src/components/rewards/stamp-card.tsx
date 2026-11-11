import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CoinIcon, StampTile } from "@/src/components/rewards/reward-tokens";
import type { CustomerRewards } from "@/src/hooks/use-rewards-api";
import { palette } from "@/src/theme/palette";

export function stampHeadline(rewards: CustomerRewards) {
  const { stamps, boxes } = rewards;
  if (boxes.some((box) => box.status === "ready")) return "Your mystery box is ready — open it!";
  if (stamps.status === "requested" || boxes.some((box) => box.status === "requested")) return "Box claimed — waiting for approval";
  if (stamps.status === "eligible") return "Card full! Claim your mystery box 🎁";
  return `${stamps.remaining} more stamp${stamps.remaining === 1 ? "" : "s"} to a mystery box`;
}

export function StampGrid({ completed, target, size = 50 }: { completed: number; target: number; size?: number }) {
  return (
    <View style={styles.grid} accessibilityLabel={`${completed} of ${target} stamps`}>
      {Array.from({ length: target }, (_, index) => (
        <StampTile key={index} filled={index < completed} isGift={index === target - 1} size={size} />
      ))}
    </View>
  );
}

// Compact card for the top of Hype → opens Rewards.
export function StampCardTeaser({ rewards, onPress }: { rewards: CustomerRewards; onPress: () => void }) {
  const { stamps, spins, coins } = rewards;
  const progress = stamps.target ? Math.min(1, stamps.completed / stamps.target) : 0;
  const highlight = stamps.status === "eligible" || rewards.boxes.some((box) => box.status === "ready") || spins.readyCount > 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.teaser, highlight ? styles.teaserHot : null, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel={`Rewards. ${stamps.completed} of ${stamps.target} stamps. ${stampHeadline(rewards)}`}
    >
      <View style={styles.teaserIcon}>
        <Ionicons name={stamps.status === "eligible" ? "gift" : "ticket"} size={20} color={palette.onPrimary} />
      </View>
      <View style={styles.teaserCopy}>
        <View style={styles.titleRow}>
          <Text style={styles.teaserTitle}>
            📮 {stamps.completed}/{stamps.target}
          </Text>
          <View style={styles.coinRow}>
            <CoinIcon size={15} />
            <Text style={styles.coinText}>{coins.balance}</Text>
          </View>
        </View>
        <Text style={styles.teaserText} numberOfLines={1}>
          {stampHeadline(rewards)}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>
      {spins.readyCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>🎡 {spins.readyCount}</Text>
          <Text style={styles.badgeLabel}>to spin</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  teaser: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  teaserHot: { borderWidth: 1.5, borderColor: palette.primary, backgroundColor: palette.primarySoft },
  teaserIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary },
  teaserCopy: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  teaserTitle: { fontSize: 14.5, fontWeight: "800", color: palette.foreground },
  coinRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  coinText: { fontSize: 13, fontWeight: "800", color: palette.foreground },
  teaserText: { fontSize: 12.5, color: palette.mutedForeground },
  track: { height: 6, borderRadius: 3, backgroundColor: "#EEEFF2", overflow: "hidden", marginTop: 3 },
  fill: { height: 6, borderRadius: 3, backgroundColor: palette.primary },
  badge: { minWidth: 56, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 14, alignItems: "center", backgroundColor: "#111111" },
  badgeText: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  badgeLabel: { fontSize: 9.5, fontWeight: "700", color: "#E3E4E7" },
});
