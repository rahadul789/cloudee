import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { playRewardSound, rewardHaptics } from "@/src/lib/reward-sounds";
import { palette } from "@/src/theme/palette";

const CONFETTI_COLORS = ["#FFB84C", "#FFFFFF", "#E5484D", "#3DD68C", "#4DA3FF", "#FFC93C"];

/** The gift box drawn from Views: body, lid, ribbon, bow. */
function GiftBox({ lidLift, lidTilt }: { lidLift: Animated.Value; lidTilt: Animated.Value }) {
  return (
    <View style={styles.box}>
      <Animated.View
        style={[
          styles.lid,
          {
            transform: [
              { translateY: lidLift.interpolate({ inputRange: [0, 1], outputRange: [0, -120] }) },
              { rotate: lidTilt.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-24deg"] }) },
            ],
            opacity: lidLift.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
          },
        ]}
      >
        <View style={styles.lidRibbon} />
        <View style={styles.bow}>
          <View style={[styles.bowLoop, { transform: [{ rotate: "-30deg" }], left: 0 }]} />
          <View style={[styles.bowLoop, { transform: [{ rotate: "30deg" }], right: 0 }]} />
        </View>
      </Animated.View>
      <View style={styles.body}>
        <View style={styles.bodyRibbon} />
      </View>
    </View>
  );
}

// Box opening: shake ×3 → lid pops → glow → prize card rises → confetti. Bigger prize = bigger party.
export function MysteryBoxReveal({
  visible,
  prizeAmount,
  voucherCode,
  onClose,
}: {
  visible: boolean;
  prizeAmount: number | null;
  voucherCode: string;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const shake = useRef(new Animated.Value(0)).current;
  const lidLift = useRef(new Animated.Value(0)).current;
  const lidTilt = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<"idle" | "opening" | "open">("idle");
  // Pending sound/haptic timers — cleared if the modal closes (or unmounts) mid-animation,
  // so nothing keeps playing in the background.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(setTimeout(fn, ms));
  };
  const big = (prizeAmount ?? 0) >= 20;

  const confetti = useMemo(
    () =>
      Array.from({ length: big ? 40 : 22 }, (_, i) => ({
        x: Math.random() * width,
        delay: Math.random() * 400,
        drift: (Math.random() - 0.5) * 120,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 6,
        fall: new Animated.Value(0),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, big, width],
  );
  const confettiRef = useRef(confetti);
  confettiRef.current = confetti;

  useEffect(() => {
    const stopAll = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      [shake, lidLift, lidTilt, glow, card].forEach((value) => value.stopAnimation());
      confettiRef.current.forEach((piece) => piece.fall.stopAnimation());
    };
    if (!visible) {
      stopAll();
      [shake, lidLift, lidTilt, glow, card].forEach((value) => value.setValue(0));
      setPhase("idle");
    }
    return visible ? stopAll : undefined;
  }, [card, glow, lidLift, lidTilt, shake, visible]);

  // Start only once the prize is known (it's decided on the server).
  useEffect(() => {
    if (!visible || prizeAmount === null || phase !== "idle") return;
    setPhase("opening");
    const wiggle = (to: number) => Animated.timing(shake, { toValue: to, duration: 70, useNativeDriver: true });
    // Every shake knocks (sound + haptic), building up before it bursts open.
    const knock = () => {
      playRewardSound("shake");
      rewardHaptics.knock();
    };
    [250, 560, 1050].forEach((ms) => later(knock, ms));
    Animated.sequence([
      Animated.delay(250),
      wiggle(1), wiggle(-1), wiggle(1), wiggle(-1), wiggle(0),
      Animated.delay(150),
      wiggle(1), wiggle(-1), wiggle(1), wiggle(0),
      Animated.delay(120),
      wiggle(1), wiggle(-1), wiggle(1), wiggle(-1), wiggle(1), wiggle(0),
    ]).start(({ finished }) => {
      if (!finished) return; // closed mid-shake
      playRewardSound("open");
      rewardHaptics.boxOpen(big);
      later(() => playRewardSound("win", big ? 1 : 0.8), 450);
      Animated.parallel([
        Animated.timing(lidLift, { toValue: 1, duration: 520, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
        Animated.timing(lidTilt, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.spring(card, { toValue: 1, damping: 9, stiffness: 120, useNativeDriver: true, delay: 200 }),
        ...confetti.map((piece) =>
          Animated.timing(piece.fall, {
            toValue: 1,
            duration: 1800 + Math.random() * 900,
            delay: piece.delay,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ),
      ]).start(({ finished }) => {
        if (finished) setPhase("open");
      });
    });
  }, [big, card, confetti, glow, lidLift, lidTilt, phase, prizeAmount, shake, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        {confetti.map((piece, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.confetti,
              {
                left: piece.x,
                width: piece.size,
                height: piece.size * 1.6,
                backgroundColor: piece.color,
                opacity: piece.fall.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateY: piece.fall.interpolate({ inputRange: [0, 1], outputRange: [height * 0.3, height] }) },
                  { translateX: piece.fall.interpolate({ inputRange: [0, 1], outputRange: [0, piece.drift] }) },
                  { rotate: piece.fall.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${360 + i * 40}deg`] }) },
                ],
              },
            ]}
          />
        ))}

        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, big ? 0.9 : 0.6] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, big ? 1.6 : 1.2] }) }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.prizeCard,
            {
              opacity: card,
              transform: [
                { translateY: card.interpolate({ inputRange: [0, 1], outputRange: [60, -40] }) },
                { scale: card.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            },
          ]}
        >
          <Text style={styles.prizeEyebrow}>{big ? "WOW! 🎉" : "You got"}</Text>
          <Text style={styles.prizeAmount}>৳{prizeAmount ?? ""} off</Text>
          {voucherCode ? <Text style={styles.prizeCode}>Code {voucherCode}</Text> : null}
          <Text style={styles.prizeHint}>Saved to your vouchers — apply it at checkout.</Text>
        </Animated.View>

        <Animated.View
          style={{
            marginTop: 30,
            transform: [{ rotate: shake.interpolate({ inputRange: [-1, 1], outputRange: ["-8deg", "8deg"] }) }],
          }}
        >
          <GiftBox lidLift={lidLift} lidTilt={lidTilt} />
        </Animated.View>

        {prizeAmount === null ? <Text style={styles.waiting}>Opening…</Text> : null}

        {phase === "open" ? (
          <Pressable onPress={onClose} style={({ pressed }) => [styles.close, pressed ? { opacity: 0.85 } : null]} accessibilityRole="button">
            <Ionicons name="checkmark" size={18} color={palette.onPrimary} />
            <Text style={styles.closeText}>Awesome</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,10,12,0.88)" },
  confetti: { position: "absolute", top: 0, borderRadius: 2 },
  glow: { position: "absolute", width: 280, height: 280, borderRadius: 140, backgroundColor: "#FFB84C" },
  box: { width: 150, height: 150, alignItems: "center", justifyContent: "flex-end" },
  lid: {
    position: "absolute",
    top: 22,
    width: 162,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#E5484D",
    alignItems: "center",
    zIndex: 2,
  },
  lidRibbon: { position: "absolute", width: 26, top: 0, bottom: 0, backgroundColor: "#FFC93C" },
  bow: { position: "absolute", top: -26, width: 70, height: 30 },
  bowLoop: {
    position: "absolute",
    top: 0,
    width: 34,
    height: 26,
    borderRadius: 13,
    borderWidth: 7,
    borderColor: "#FFC93C",
  },
  body: { width: 140, height: 96, borderRadius: 8, backgroundColor: "#C93A3F", alignItems: "center", overflow: "hidden" },
  bodyRibbon: { width: 26, height: "100%", backgroundColor: "#FFC93C" },
  prizeCard: {
    position: "absolute",
    top: "18%",
    minWidth: 240,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: palette.primary,
  },
  prizeEyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 1, color: "rgba(17,17,17,0.7)" },
  prizeAmount: { fontSize: 38, lineHeight: 44, fontWeight: "900", color: palette.onPrimary },
  prizeCode: { fontSize: 14, fontWeight: "800", letterSpacing: 1.2, color: palette.onPrimary },
  prizeHint: { fontSize: 12, color: "rgba(17,17,17,0.72)", textAlign: "center" },
  waiting: { marginTop: 24, fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  close: {
    position: "absolute",
    bottom: 60,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.primary,
  },
  closeText: { fontSize: 16, fontWeight: "800", color: palette.onPrimary },
});
