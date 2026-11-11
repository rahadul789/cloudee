import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";

import { useCustomerRewardsQuery } from "@/src/hooks/use-rewards-api";

// Home top bar: appears ONLY when there's something to do — a spin ready or a mystery box to
// open — and gently pulses. Otherwise it renders nothing (home stays clean).
export function HomeRewardsChip({ active, onPress }: { active: boolean; onPress: () => void }) {
  const rewardsQuery = useCustomerRewardsQuery(active);
  const rewards = rewardsQuery.data;
  const boxReady = rewards?.boxes.some((box) => box.status === "ready") ?? false;
  const spinsReady = rewards?.spins.readyCount ?? 0;
  const show = Boolean(rewards && (boxReady || spinsReady > 0));
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!show || !active) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.delay(1800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse, show]);

  if (!show) return null;
  const label = boxReady ? "🎁 Open" : `🎡 ${spinsReady}`;
  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.chip, pressed ? { opacity: 0.85 } : null]}
        accessibilityRole="button"
        accessibilityLabel={boxReady ? "Your mystery box is ready" : `${spinsReady} spin${spinsReady === 1 ? "" : "s"} ready`}
        hitSlop={6}
      >
        <Text style={styles.text}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 40,
    minWidth: 52,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111111",
  },
  text: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
