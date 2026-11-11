import { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

import { CoinIcon } from "@/src/components/rewards/reward-tokens";
import type { SpinItem } from "@/src/hooks/use-rewards-api";
import { palette } from "@/src/theme/palette";

// Game-style spin tickets for the Rewards screen.
//  · LOCKED  → dark arcade card, segmented HH:MM:SS countdown + charge bar, ⚡ coin skip.
//  · READY   → amber jackpot card, slowly turning mini wheel, pulsing SPIN button.
// Perf rules: the 1s ticker lives HERE (only locked tickets tick, only while `active`),
// all motion is native-driver transform/opacity, and every loop stops when inactive/unmounted.

const RIM_COLORS = ["#FFB84C", "#111111", "#FF7A59", "#111111", "#FFD27A", "#111111", "#FF9F43", "#111111"];

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return [pad(Math.floor(total / 3600)), pad(Math.floor((total % 3600) / 60)), pad(total % 60)];
}

function msUntil(spin: SpinItem) {
  return spin.unlocksAt ? new Date(spin.unlocksAt).getTime() - Date.now() : 0;
}

/** Ticks once a second while `enabled`; returns ms left (≤0 = unlocked). */
function useLockedMs(spin: SpinItem, enabled: boolean) {
  const [left, setLeft] = useState(() => msUntil(spin));
  useEffect(() => {
    setLeft(msUntil(spin));
    if (!enabled || msUntil(spin) <= 0) return;
    const timer = setInterval(() => {
      const next = msUntil(spin);
      setLeft(next);
      if (next <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled, spin]);
  return left;
}

const MiniWheel = memo(function MiniWheel({ size, turning, dim }: { size: number; turning: boolean; dim?: boolean }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!turning) return;
    rotation.setValue(0);
    const loop = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [rotation, turning]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const r = size / 2;
  const dot = Math.max(6, size * 0.13);

  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.45 : 1 }}>
      <Animated.View
        style={[
          styles.wheel,
          { width: size, height: size, borderRadius: r, transform: [{ rotate }] },
        ]}
      >
        {[0, 45, 90, 135].map((deg) => (
          <View
            key={deg}
            style={[styles.spoke, { width: size - 8, left: 4, top: r - 1, transform: [{ rotate: `${deg}deg` }] }]}
          />
        ))}
        {RIM_COLORS.map((color, index) => {
          const angle = (index / RIM_COLORS.length) * Math.PI * 2;
          const dist = r - dot * 0.95;
          return (
            <View
              key={index}
              style={{
                position: "absolute",
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                backgroundColor: color,
                left: r + Math.cos(angle) * dist - dot / 2,
                top: r + Math.sin(angle) * dist - dot / 2,
              }}
            />
          );
        })}
        <View style={[styles.hub, { width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15 }]} />
      </Animated.View>
      <View style={[styles.pointer, { left: r - 5 }]} />
    </View>
  );
});

export const SpinTicket = memo(function SpinTicket({
  spin,
  active,
  animate,
  unlockHours,
  skipCost,
  onSpin,
  onSkip,
}: {
  spin: SpinItem;
  /** Screen focused — stops ticker + loops when false. */
  active: boolean;
  /** Only the first ready ticket animates (keeps many tickets cheap). */
  animate: boolean;
  unlockHours: number;
  skipCost: number;
  onSpin: (spin: SpinItem) => void;
  onSkip: (spin: SpinItem) => void;
}) {
  const left = useLockedMs(spin, active);
  const locked = left > 0;
  const pulse = useRef(new Animated.Value(0)).current;
  const live = active && animate && !locked;

  useEffect(() => {
    if (!live) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(700),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, pulse]);

  const orderLabel = spin.orderNumber ? `Order #${spin.orderNumber.replace(/^#/, "")}` : "Delivered order";

  if (locked) {
    const [h, m, s] = parts(left);
    const totalMs = Math.max(1, unlockHours * 3600 * 1000);
    const charged = Math.min(1, Math.max(0.02, 1 - left / totalMs));
    return (
      <View style={styles.lockedCard}>
        <View style={styles.row}>
          <MiniWheel size={54} turning={false} dim />
          <View style={styles.copy}>
            <View style={styles.lockTag}>
              <Text style={styles.lockTagText}>🔒 CHARGING</Text>
            </View>
            <Text style={styles.lockedMeta} numberOfLines={1}>
              {orderLabel}
            </Text>
          </View>
          <Pressable
            onPress={() => onSkip(spin)}
            style={({ pressed }) => [styles.skip, pressed ? styles.pressed : null]}
            accessibilityRole="button"
            accessibilityLabel={`Open now for ${skipCost} coins`}
            hitSlop={6}
          >
            <Text style={styles.skipBolt}>⚡</Text>
            <CoinIcon size={14} />
            <Text style={styles.skipText}>{skipCost}</Text>
          </Pressable>
        </View>

        <View style={styles.clockRow} accessibilityLabel={`Opens in ${h} hours ${m} minutes ${s} seconds`}>
          {[h, m, s].map((value, index) => (
            <View key={index} style={styles.clockGroup}>
              {index > 0 ? <Text style={styles.clockColon}>:</Text> : null}
              <View style={styles.clockCell}>
                <Text style={styles.clockDigits}>{value}</Text>
                <Text style={styles.clockUnit}>{["HRS", "MIN", "SEC"][index]}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.chargeTrack}>
          <View style={[styles.chargeFill, { width: `${Math.round(charged * 100)}%` }]} />
        </View>
      </View>
    );
  }

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });

  return (
    <Pressable
      onPress={() => onSpin(spin)}
      style={({ pressed }) => [styles.readyCard, pressed ? styles.pressed : null]}
      accessibilityRole="button"
      accessibilityLabel="Spin ready. Tap to spin"
    >
      <View style={styles.row}>
        <MiniWheel size={64} turning={live} />
        <View style={styles.copy}>
          <View style={styles.readyTag}>
            <Text style={styles.readyTagText}>★ READY</Text>
          </View>
          <Text style={styles.readyTitle}>Your spin is live!</Text>
          <Text style={styles.readyMeta} numberOfLines={1}>
            {orderLabel}
          </Text>
        </View>
        <View style={styles.spinWrap}>
          <Animated.View
            pointerEvents="none"
            style={[styles.spinRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
          />
          <View style={styles.spinButton}>
            <Text style={styles.spinButtonText}>SPIN</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 4 },

  wheel: {
    backgroundColor: "#FFF4E0",
    borderWidth: 3,
    borderColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  spoke: { position: "absolute", height: 2, backgroundColor: "rgba(17,17,17,0.18)" },
  hub: { backgroundColor: "#111111", borderWidth: 2, borderColor: "#FFB84C" },
  pointer: {
    position: "absolute",
    top: -4,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#E5484D",
  },

  // locked — dark arcade
  lockedCard: { gap: 12, padding: 14, borderRadius: 22, backgroundColor: "#17171C" },
  lockTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  lockTagText: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, color: "#C9CDD5" },
  lockedMeta: { fontSize: 12.5, color: "#9AA0A6" },
  skip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: palette.primary,
  },
  skipBolt: { fontSize: 13 },
  skipText: { fontSize: 13.5, fontWeight: "700", color: palette.onPrimary, fontVariant: ["tabular-nums"] },
  clockRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  clockGroup: { flexDirection: "row", alignItems: "center" },
  clockColon: { marginHorizontal: 6, marginBottom: 12, fontSize: 22, fontWeight: "700", color: "#FFB84C" },
  clockCell: {
    width: 64,
    paddingTop: 6,
    paddingBottom: 5,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#0B0B0E",
    borderWidth: 1,
    borderColor: "rgba(255,184,76,0.25)",
  },
  clockDigits: { fontSize: 26, lineHeight: 30, fontWeight: "700", color: "#FFB84C", fontVariant: ["tabular-nums"] },
  clockUnit: { fontSize: 9, fontWeight: "700", letterSpacing: 1, color: "#6B7078" },
  chargeTrack: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)" },
  chargeFill: { height: 6, borderRadius: 3, backgroundColor: "#FFB84C" },

  // ready — amber jackpot
  readyCard: {
    padding: 14,
    borderRadius: 22,
    backgroundColor: palette.primary,
    borderWidth: 2,
    borderColor: "#111111",
  },
  readyTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    backgroundColor: "#111111",
  },
  readyTagText: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.8, color: "#FFB84C" },
  readyTitle: { fontSize: 16, fontWeight: "700", color: palette.onPrimary },
  readyMeta: { fontSize: 12, color: "rgba(17,17,17,0.7)" },
  spinWrap: { width: 72, height: 44, alignItems: "center", justifyContent: "center" },
  spinRing: { position: "absolute", width: 72, height: 44, borderRadius: 22, borderWidth: 3, borderColor: "#111111" },
  spinButton: {
    width: 72,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111111",
  },
  spinButtonText: { fontSize: 15, fontWeight: "700", letterSpacing: 1, color: "#FFB84C" },
});
