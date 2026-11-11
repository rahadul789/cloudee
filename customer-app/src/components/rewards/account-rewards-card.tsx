import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CoinIcon } from "@/src/components/rewards/reward-tokens";
import { stampHeadline } from "@/src/components/rewards/stamp-card";
import { useCustomerRewardsQuery } from "@/src/hooks/use-rewards-api";
import { palette } from "@/src/theme/palette";

// Account → Rewards: coins · stamps · spins at a glance; tap opens Rewards.
// Static (no animation) on purpose — Account is a list screen, keep it cheap.
export function AccountRewardsCard({ onOpenRewards }: { onOpenRewards: () => void }) {
  const rewardsQuery = useCustomerRewardsQuery();
  const rewards = rewardsQuery.data;
  const progress = rewards?.stamps.target ? Math.min(1, rewards.stamps.completed / rewards.stamps.target) : 0;
  const spinsReady = rewards?.spins.readyCount ?? 0;
  const boxReady = rewards?.boxes.some((box) => box.status === "ready") ?? false;
  const eligible = rewards?.stamps.status === "eligible";
  const cta = boxReady ? "Open box" : spinsReady > 0 ? "Spin now" : eligible ? "Claim" : null;

  return (
    <Pressable
      onPress={onOpenRewards}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel="Rewards"
    >
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name={boxReady || eligible ? "gift" : "trophy"} size={19} color={palette.onPrimary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Rewards</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {rewards ? stampHeadline(rewards) : "Order, collect stamps and spin"}
          </Text>
        </View>
        {cta ? (
          <View style={styles.ctaPill}>
            <Text style={styles.ctaText}>{cta}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
        )}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <View style={styles.statValueRow}>
            <CoinIcon size={16} />
            <Text style={styles.statValue}>{rewards?.coins.balance ?? "—"}</Text>
          </View>
          <Text style={styles.statLabel}>Coins</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {rewards ? `${rewards.stamps.completed}/${rewards.stamps.target}` : "—"}
          </Text>
          <Text style={styles.statLabel}>Stamps</Text>
        </View>
        <View style={[styles.stat, spinsReady > 0 ? styles.statHot : null]}>
          <Text style={styles.statValue}>{rewards ? spinsReady : "—"}</Text>
          <Text style={[styles.statLabel, spinsReady > 0 ? styles.statLabelHot : null]}>
            {spinsReady === 1 ? "Spin ready" : "Spins ready"}
          </Text>
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.92 },
  card: {
    gap: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: palette.primary },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, fontWeight: "700", color: palette.foreground },
  subtitle: { fontSize: 12.5, color: palette.mutedForeground },
  ctaPill: { height: 30, paddingHorizontal: 12, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#111111" },
  ctaText: { fontSize: 12.5, fontWeight: "700", color: "#FFFFFF" },
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: palette.surfaceMuted,
  },
  statHot: { backgroundColor: palette.primarySoft },
  statValueRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statValue: { fontSize: 16, fontWeight: "700", color: palette.foreground, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 11.5, color: palette.mutedForeground },
  statLabelHot: { color: palette.secondary, fontWeight: "700" },
  track: { height: 6, borderRadius: 3, backgroundColor: "#EEEFF2", overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: palette.primary },
});
