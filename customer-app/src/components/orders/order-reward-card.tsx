import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SpinItem, SpinPrize } from "@/src/hooks/use-rewards-api";
import { palette } from "@/src/theme/palette";

// "This order earned you…" on the delivered screen. Two parts:
//   • Stamp strip (own amber background): "+1 stamp · 5/7" with mini stamp dots
//   • Spin row, in every state: locked (countdown) · ready (Spin now) · won · no luck · expired
// The countdown ticks once a minute and only while the spin is still locked.


function prizeLine(prize: SpinPrize | null | undefined) {
  if (!prize) return { title: "Spin used", detail: "" };
  switch (prize.type) {
    case "coins":
      return { title: `You won ${prize.amount} coins`, detail: "Added to your coin wallet" };
    case "bonus_stamp":
      return { title: "You won a bonus stamp", detail: "One step closer to your mystery box" };
    case "free_delivery":
      return { title: "You won free delivery", detail: prize.voucherCode ? `Code ${prize.voucherCode} · in My vouchers` : "Saved to My vouchers" };
    case "discount":
      return { title: `You won ${prize.label}`, detail: prize.voucherCode ? `Code ${prize.voucherCode} · in My vouchers` : "Saved to My vouchers" };
    default:
      return { title: "Better luck next time", detail: "Every delivered order brings a new spin" };
  }
}

function formatLeft(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function StampStrip({ completed, target }: { completed: number; target: number }) {
  const full = completed >= target;
  const dots = Math.min(Math.max(target, 1), 10);
  return (
    <View style={styles.stamp}>
      <View style={styles.stampIcon}>
        <Ionicons name="ribbon" size={20} color={palette.onPrimary} />
      </View>
      <View style={styles.stampCopy}>
        <Text style={styles.stampTitle}>
          {full ? "Stamp card full! 🎁" : "You earned a stamp 🎟️"}
        </Text>
        <View style={styles.stampDots}>
          {Array.from({ length: dots }).map((_, index) => (
            <View key={index} style={[styles.stampDot, index < completed ? styles.stampDotOn : null]}>
              {index < completed ? <Ionicons name="checkmark" size={9} color={palette.onPrimary} /> : null}
            </View>
          ))}
          <Text style={styles.stampCount}>
            {Math.min(completed, target)}/{target}
          </Text>
        </View>
      </View>
      {full ? <Text style={styles.stampClaim}>Mystery box</Text> : null}
    </View>
  );
}

export function OrderRewardCard({
  spin,
  stamp,
  onOpen,
}: {
  spin: SpinItem | null;
  stamp?: { completed: number; target: number } | null;
  onOpen: () => void;
}) {
  const unlocksAt = spin?.unlocksAt ? Date.parse(spin.unlocksAt) : Number.NaN;
  const [now, setNow] = useState(() => Date.now());
  const locked = spin?.status === "unscratched" && Number.isFinite(unlocksAt) && unlocksAt > now;
  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [locked]);

  let icon: keyof typeof Ionicons.glyphMap = "gift";
  let title = "";
  let detail = "";
  let cta = "";
  let tone: "hot" | "won" | "locked" | "quiet" = "quiet";

  if (spin) {
    if (spin.status === "unscratched") {
      if (locked) {
        icon = "lock-closed";
        title = "You earned a spin 🎡";
        detail = `Unlocks in ${formatLeft(unlocksAt - now)} · or open it early with coins`;
        cta = "View";
        tone = "locked";
      } else {
        icon = "sync";
        title = "Your spin is ready 🎡";
        detail = "Spin the wheel to win coins, stamps or vouchers";
        cta = "Spin now";
        tone = "hot";
      }
    } else if (spin.status === "scratched") {
      const line = prizeLine(spin.prize);
      const lost = !spin.prize || spin.prize.type === "fun";
      icon = lost ? "happy-outline" : "trophy";
      title = line.title;
      detail = line.detail;
      cta = lost ? "" : "Rewards";
      tone = lost ? "quiet" : "won";
    } else {
      icon = "time-outline";
      title = "Spin expired";
      detail = "Spins from future orders will show up here";
    }
  }

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        tone === "hot" ? styles.cardHot : tone === "won" ? styles.cardWon : tone === "locked" ? styles.cardLocked : null,
        pressed ? styles.pressed : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={[stamp ? "Stamp earned" : "", title].filter(Boolean).join(". ")}
    >
      <Text style={[styles.eyebrow, tone === "hot" ? styles.eyebrowHot : null]}>THIS ORDER&apos;S REWARDS</Text>
      {stamp ? <StampStrip completed={stamp.completed} target={stamp.target} /> : null}
      {spin ? (
        <View style={styles.row}>
          <View style={[styles.icon, tone !== "quiet" ? styles.iconHot : null]}>
            <Ionicons name={icon} size={20} color={tone === "quiet" ? palette.foreground : palette.onPrimary} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, tone === "hot" ? styles.titleHot : null]} numberOfLines={2}>
              {title}
            </Text>
            {detail ? (
              <Text style={[styles.detail, tone === "hot" ? styles.detailHot : null]} numberOfLines={2}>
                {detail}
              </Text>
            ) : null}
          </View>
          {cta ? (
            <View style={[styles.cta, styles.ctaHot]}>
              <Text style={[styles.ctaText, styles.ctaTextHot]}>{cta}</Text>
              <Ionicons name="arrow-forward" size={14} color={palette.onPrimary} />
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={palette.mutedForeground} />
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.92 },
  card: {
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  cardHot: { backgroundColor: "#111111", borderColor: "#111111" },
  cardWon: { backgroundColor: palette.primarySoft, borderColor: "#F3D8A8" },
  cardLocked: { borderWidth: 1.5, borderColor: palette.primary },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, color: palette.mutedForeground },
  eyebrowHot: { color: palette.primary },
  stamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#FFE7B8",
  },
  stampIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
    transform: [{ rotate: "-8deg" }],
  },
  stampCopy: { flex: 1, minWidth: 0, gap: 6 },
  stampTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  stampDots: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  stampDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#D9A54A",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  stampDotOn: { backgroundColor: palette.secondary, borderColor: palette.secondary },
  stampCount: { marginLeft: 4, fontSize: 12.5, fontWeight: "700", color: "#7A4A00" },
  stampClaim: { fontSize: 12, fontWeight: "700", color: "#7A4A00" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  iconHot: { backgroundColor: palette.primary },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, fontWeight: "700", color: palette.foreground },
  titleHot: { color: "#FFFFFF" },
  detail: { fontSize: 12.5, lineHeight: 17, color: palette.mutedForeground },
  detailHot: { color: "rgba(255,255,255,0.7)" },
  cta: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceMuted,
  },
  ctaHot: { backgroundColor: palette.primary },
  ctaText: { fontSize: 13, fontWeight: "700", color: palette.foreground },
  ctaTextHot: { color: palette.onPrimary },
});
