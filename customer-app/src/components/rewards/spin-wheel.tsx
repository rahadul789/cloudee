import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Animated, Easing, PanResponder, StyleSheet, Text, View } from "react-native";

import { playRewardSound, rewardHaptics } from "@/src/lib/reward-sounds";

import type { WheelSegment } from "@/src/hooks/use-rewards-api";

export type SpinWheelHandle = { spinTo: (segmentId: string) => Promise<void> };
export type SpinWheelMode = "idle" | "spinning" | "win" | "lose";

const ICON: Record<WheelSegment["type"], string> = {
  coins: "🪙",
  bonus_stamp: "📮",
  free_delivery: "🛵",
  discount: "💸",
  fun: "😄",
};

const AMBER = "#FFB84C";
const GOLD = "#FFD27A";
const INK = "#111111";
const BEZEL = "#17171C";
const BULBS = 20;

// Arcade palette: amber/gold for everyday prizes, red for rare jackpots, deep slate for "better luck".
function colorsFor(segment: WheelSegment, index: number) {
  if (segment.type === "free_delivery" || segment.type === "discount" || (segment.type === "coins" && segment.amount >= 50)) {
    return { bg: "#E5484D", fg: "#FFFFFF" }; // rare / jackpot
  }
  if (segment.type === "fun") return { bg: "#2A2A33", fg: "#B7BCC6" };
  if (segment.type === "bonus_stamp") return { bg: "#FFF4E0", fg: INK };
  return index % 2 ? { bg: GOLD, fg: "#4A2E00" } : { bg: AMBER, fg: "#3D2600" };
}

// A slice of the disc drawn with plain Views (no SVG): a half-disc rotated inside a half clip.
function Wedge({ size, start, sweep, color }: { size: number; start: number; sweep: number; color: string }) {
  const r = size / 2;
  if (sweep > 180) {
    return (
      <>
        <Wedge size={size} start={start} sweep={180} color={color} />
        <Wedge size={size} start={start + 180} sweep={sweep - 180} color={color} />
      </>
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${start}deg` }] }]} pointerEvents="none">
      <View style={{ position: "absolute", left: r, top: 0, width: r, height: size, overflow: "hidden" }}>
        <View style={{ position: "absolute", left: -r, top: 0, width: size, height: size, transform: [{ rotate: `${sweep}deg` }] }}>
          <View style={{ position: "absolute", left: 0, top: 0, width: r, height: size, backgroundColor: color }} />
        </View>
      </View>
    </View>
  );
}

// Slice size = the real chance (honest wheel). The server picks the prize; we only animate to it.
// Interactive: drag/fling the wheel, or tap the SPIN hub. Every slice that passes the pointer
// ticks (sound + haptic + pointer flick). Marquee bulbs chase around the bezel — slow when idle,
// fast while spinning, all-flash on a win. One native-driver loop; it dies with the modal.
export const SpinWheel = forwardRef<
  SpinWheelHandle,
  { segments: WheelSegment[]; size: number; onFlick?: () => void; canFlick?: boolean; mode?: SpinWheelMode }
>(function SpinWheel({ segments, size, onFlick, canFlick = false, mode = "idle" }, ref) {
  const rotation = useRef(new Animated.Value(0)).current;
  const pointerKick = useRef(new Animated.Value(0)).current;
  const chase = useRef(new Animated.Value(0)).current;
  const current = useRef(0);
  const total = segments.reduce((sum, s) => sum + s.chance, 0) || 1;

  const bezel = Math.round(size * 0.075);
  const outer = size;
  const disc = outer - bezel * 2;
  const R = outer / 2;
  const r = disc / 2;

  const layout = useMemo(() => {
    let cursor = 0;
    return segments.map((segment, index) => {
      const sweep = (segment.chance / total) * 360;
      const item = { segment, index, start: cursor, sweep, mid: cursor + sweep / 2 };
      cursor += sweep;
      return item;
    });
  }, [segments, total]);

  // Marquee: groups A/B alternate. Speed follows the mode; lose = steady dim.
  useEffect(() => {
    chase.stopAnimation();
    if (mode === "lose") {
      chase.setValue(0.5);
      return;
    }
    const step = mode === "spinning" ? 110 : mode === "win" ? 160 : 650;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(chase, { toValue: 1, duration: step, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(chase, { toValue: 0, duration: step, easing: Easing.linear, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [chase, mode]);

  // Which slice is under the pointer (12 o'clock) for a given wheel rotation.
  const sliceAt = useRef<(value: number) => number>(() => 0);
  sliceAt.current = (value: number) => {
    const angle = (((360 - (value % 360)) % 360) + 360) % 360;
    const found = layout.findIndex((item) => angle >= item.start && angle < item.start + item.sweep);
    return found < 0 ? 0 : found;
  };

  // Tick on every slice boundary (throttled so a fast spin doesn't machine-gun).
  useEffect(() => {
    let lastSlice = sliceAt.current(0);
    let lastTickAt = 0;
    const id = rotation.addListener(({ value }) => {
      const slice = sliceAt.current(value);
      if (slice === lastSlice) return;
      lastSlice = slice;
      const now = Date.now();
      if (now - lastTickAt < 45) return;
      lastTickAt = now;
      playRewardSound("tick", 0.7);
      rewardHaptics.tick();
      pointerKick.setValue(1);
      Animated.spring(pointerKick, { toValue: 0, damping: 6, stiffness: 400, useNativeDriver: true }).start();
    });
    return () => {
      rotation.removeListener(id);
      rotation.stopAnimation();
    };
  }, [pointerKick, rotation]);

  useImperativeHandle(ref, () => ({
    spinTo: (segmentId: string) =>
      new Promise<void>((resolve) => {
        const slot = layout.find((item) => item.segment.id === segmentId) ?? layout[0];
        // Land somewhere inside the slice (not dead centre), pointer at 12 o'clock.
        const jitter = (Math.random() - 0.5) * slot.sweep * 0.6;
        const base = Math.ceil(current.current / 360) * 360;
        const target = base + 360 * 8 + (360 - slot.mid) - jitter;
        current.current = target;
        Animated.timing(rotation, {
          toValue: target,
          duration: 7500,
          // fast start, long smooth glide, gentle stop
          easing: Easing.bezier(0.12, 0.72, 0.18, 1),
          useNativeDriver: true,
        }).start(() => resolve());
      }),
  }));

  // Finger drag: the wheel follows the finger around its centre; a quick release = fling.
  // A tap on the hub also spins.
  const drag = useRef({ lastAngle: 0, lastTime: 0, velocity: 0, moved: 0, onHub: false });
  const flickRef = useRef(onFlick);
  flickRef.current = onFlick;
  const canFlickRef = useRef(canFlick);
  canFlickRef.current = canFlick;
  const hubRadius = Math.max(30, disc * 0.15);
  const angleOf = (x: number, y: number) => (Math.atan2(y - R, x - R) * 180) / Math.PI;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => canFlickRef.current,
        onMoveShouldSetPanResponder: () => canFlickRef.current,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          const { locationX: x, locationY: y } = event.nativeEvent;
          const angle = angleOf(x, y);
          drag.current = {
            lastAngle: angle,
            lastTime: Date.now(),
            velocity: 0,
            moved: 0,
            onHub: Math.hypot(x - R, y - R) <= hubRadius + 6,
          };
        },
        onPanResponderMove: (event) => {
          const angle = angleOf(event.nativeEvent.locationX, event.nativeEvent.locationY);
          let step = angle - drag.current.lastAngle;
          if (step > 180) step -= 360;
          if (step < -180) step += 360;
          const now = Date.now();
          const dt = Math.max(1, now - drag.current.lastTime);
          drag.current.velocity = step / dt; // deg per ms
          drag.current.moved += step;
          drag.current.lastAngle = angle;
          drag.current.lastTime = now;
          current.current += step;
          rotation.setValue(current.current);
        },
        onPanResponderRelease: () => {
          const { velocity, moved, onHub } = drag.current;
          if (Math.abs(velocity) > 0.25 || Math.abs(moved) > 40 || (onHub && Math.abs(moved) < 8)) flickRef.current?.();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [R, hubRadius],
  );

  const bulbA = chase;
  const bulbB = chase.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const bulb = Math.max(7, Math.round(bezel * 0.42));
  const bulbOrbit = R - bezel / 2;
  const showHubLabel = canFlick && mode === "idle";

  return (
    <View style={{ width: outer, height: outer + 10, paddingTop: 10 }} {...responder.panHandlers}>
      {/* bezel + marquee bulbs */}
      <View style={[styles.bezel, { width: outer, height: outer, borderRadius: R }]}>
        {Array.from({ length: BULBS }, (_, i) => {
          const a = (i / BULBS) * Math.PI * 2;
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[
                styles.bulb,
                {
                  width: bulb,
                  height: bulb,
                  borderRadius: bulb / 2,
                  left: R + Math.cos(a) * bulbOrbit - bulb / 2,
                  top: R + Math.sin(a) * bulbOrbit - bulb / 2,
                  opacity: i % 2 ? bulbB : bulbA,
                },
              ]}
            />
          );
        })}

        {/* disc */}
        <Animated.View
          style={[
            styles.disc,
            {
              left: bezel,
              top: bezel,
              width: disc,
              height: disc,
              borderRadius: r,
              transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] }) }],
            },
          ]}
        >
          {layout.map((item) => (
            <Wedge key={item.segment.id} size={disc} start={item.start} sweep={item.sweep} color={colorsFor(item.segment, item.index).bg} />
          ))}
          {/* gold dividers between slices */}
          {layout.map((item) => (
            <View key={`d-${item.segment.id}`} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${item.start}deg` }] }]} pointerEvents="none">
              <View style={[styles.divider, { left: r - 1, height: r }]} />
            </View>
          ))}
          {layout.map((item) => {
            const { fg } = colorsFor(item.segment, item.index);
            const small = item.sweep < 22;
            return (
              <View key={`l-${item.segment.id}`} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${item.mid}deg` }] }]} pointerEvents="none">
                <View style={{ position: "absolute", top: disc * 0.07, left: r - 34, width: 68, alignItems: "center" }}>
                  <Text style={{ fontSize: small ? 13 : 18 }}>{ICON[item.segment.type]}</Text>
                  {!small ? (
                    <Text style={[styles.sliceText, { color: fg }]} numberOfLines={2}>
                      {item.segment.type === "coins" ? `${item.segment.amount}` : item.segment.label}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
          <View style={[styles.innerRing, { width: disc, height: disc, borderRadius: r }]} pointerEvents="none" />
        </Animated.View>

        {/* hub (doesn't rotate) */}
        <View
          pointerEvents="none"
          style={[
            styles.hub,
            {
              width: hubRadius * 2,
              height: hubRadius * 2,
              borderRadius: hubRadius,
              left: R - hubRadius,
              top: R - hubRadius,
            },
          ]}
        >
          <Text style={[styles.hubText, !showHubLabel ? styles.hubStar : null]}>{showHubLabel ? "SPIN" : "★"}</Text>
        </View>
      </View>

      {/* pointer: dark outline + red blade + gold cap */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pointerWrap,
          {
            left: R - 17,
            transform: [{ rotate: pointerKick.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-22deg"] }) }],
          },
        ]}
      >
        <View style={styles.pointerOutline} />
        <View style={styles.pointerBlade} />
        <View style={styles.pointerCap} />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  bezel: { backgroundColor: BEZEL, borderWidth: 2, borderColor: "#2E2E38" },
  bulb: { position: "absolute", backgroundColor: "#FFE7A3" },
  disc: { position: "absolute", overflow: "hidden", backgroundColor: "#FFFFFF" },
  divider: { position: "absolute", top: 0, width: 2, backgroundColor: "rgba(255,231,163,0.9)" },
  sliceText: { fontSize: 11.5, lineHeight: 14, fontWeight: "700", textAlign: "center" },
  innerRing: { position: "absolute", left: 0, top: 0, borderWidth: 3, borderColor: GOLD },
  hub: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INK,
    borderWidth: 4,
    borderColor: AMBER,
  },
  hubText: { fontSize: 14, fontWeight: "700", letterSpacing: 1, color: AMBER },
  hubStar: { fontSize: 22, letterSpacing: 0 },
  pointerWrap: { position: "absolute", top: 0, width: 34, height: 44, alignItems: "center" },
  pointerOutline: {
    position: "absolute",
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 17,
    borderRightWidth: 17,
    borderTopWidth: 38,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: INK,
  },
  pointerBlade: {
    position: "absolute",
    top: 4,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 28,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#E5484D",
  },
  pointerCap: {
    position: "absolute",
    top: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GOLD,
    borderWidth: 2,
    borderColor: INK,
  },
});
