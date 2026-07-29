import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, type Ref } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import {
  useClosingSoonMs,
  useCountdownMs,
} from "@/src/lib/restaurant-availability";
import type { AreaServiceWindow } from "@/src/types/restaurant";

// Deep-red "classic closed" palette. Kept local to this component — it is a deliberate
// alarm/closed identity, distinct from the app's warm coral brand.
const CLOSED = {
  bg: "#B3261E",
  bgDeep: "#7A140E",
  bgDeeper: "#5E0F0A",
  text: "#FFFFFF",
  textDim: "rgba(255, 255, 255, 0.82)",
  amber: "#FFD8A8",
  block: "rgba(255, 255, 255, 0.14)",
  blockBorder: "rgba(255, 255, 255, 0.20)",
} as const;

function splitTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    total,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

// Big segmented live timer. The ticking hook lives HERE (not in the parent screen) so a
// once-per-second update re-renders only this tiny subtree — never the whole home/browse.
function CountdownBlocks({
  targetEpochMs,
  active = true,
}: {
  targetEpochMs: number | null;
  active?: boolean;
}) {
  const remaining = useCountdownMs(targetEpochMs, active);
  const { hours, minutes, seconds, total } = splitTime(remaining);

  if (total <= 0) {
    return <Text style={styles.openingText}>Opening shortly…</Text>;
  }

  const blocks =
    hours > 0
      ? [
          { value: pad(hours), label: "HRS" },
          { value: pad(minutes), label: "MIN" },
          { value: pad(seconds), label: "SEC" },
        ]
      : [
          { value: pad(minutes), label: "MIN" },
          { value: pad(seconds), label: "SEC" },
        ];

  return (
    <View style={styles.blocksRow}>
      {blocks.map((block) => (
        <View key={block.label} style={styles.blockGroup}>
          <View style={styles.block}>
            <Text style={styles.blockValue}>{block.value}</Text>
          </View>
          <Text style={styles.blockLabel}>{block.label}</Text>
        </View>
      ))}
    </View>
  );
}

// Compact ticking time for the sticky pill. `active` is false while the pill is hidden,
// so a scrolled-away pill stops ticking entirely.
function CountdownInline({
  targetEpochMs,
  active = true,
}: {
  targetEpochMs: number | null;
  active?: boolean;
}) {
  const remaining = useCountdownMs(targetEpochMs, active);
  const { hours, minutes, seconds } = splitTime(remaining);
  const text = hours > 0 ? `${hours}h ${pad(minutes)}m` : `${minutes}m ${pad(seconds)}s`;
  return <Text style={styles.pillTimer}>{text}</Text>;
}

/**
 * Full-bleed, deep-red "Foodbela is closed" hero shown in the scroll flow while the whole
 * area is outside its service window. Renders nothing while the area is open. Reports its
 * layout so the screen can reveal the sticky pill once it scrolls up under the top.
 */
export function ServiceClosedHero({
  area,
  showTimer = true,
  timerActive = true,
  onLayout,
  innerRef,
}: {
  area?: AreaServiceWindow | null;
  /** Show the big live countdown. Off on Browse to keep that list perfectly light. */
  showTimer?: boolean;
  /** When false the countdown stops ticking (screen unfocused / app backgrounded). */
  timerActive?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  innerRef?: Ref<View>;
}) {
  if (!area || area.isOpen !== false) return null;

  const opensLabel = area.opensAtLabel ? `Opens at ${area.opensAtLabel}` : "We'll be back soon";
  const hasReopen = typeof area.opensAtEpochMs === "number";

  return (
    <View ref={innerRef} onLayout={onLayout} style={styles.hero}>
      <View style={styles.orbA} />
      <View style={styles.orbB} />
      <View style={styles.heroContent}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>CLOSED</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>Foodbela is closed now</Text>
        <Text style={styles.heroSubtitle}>{opensLabel}</Text>
        {showTimer && hasReopen ? (
          <View style={styles.timerWrap}>
            <Text style={styles.timerCaption}>Opens in</Text>
            <CountdownBlocks targetEpochMs={area.opensAtEpochMs} active={timerActive} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Slim floating "Foodbela closed" pill. Absolutely positioned by the parent; fades /
 * slides in when `visible` flips true (the hero has scrolled under the top). Renders
 * nothing while the area is open.
 */
export function ServiceClosedStickyPill({
  area,
  visible,
  topOffset = 8,
  showTimer = true,
  timerActive = true,
}: {
  area?: AreaServiceWindow | null;
  visible: boolean;
  topOffset?: number;
  showTimer?: boolean;
  timerActive?: boolean;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [anim, visible]);

  if (!area || area.isOpen !== false) return null;

  const hasReopen = typeof area.opensAtEpochMs === "number";

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pillContainer,
        {
          top: topOffset,
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-14, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.pill}>
        <View style={styles.pillDot} />
        <Text style={styles.pillTextStrong}>Foodbela closed</Text>
        {area.opensAtLabel ? (
          <Text style={styles.pillTextDim} numberOfLines={1}>
            · opens {area.opensAtLabel}
          </Text>
        ) : null}
        {showTimer && hasReopen ? (
          <CountdownInline
            targetEpochMs={area.opensAtEpochMs}
            active={visible && timerActive}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

const CLOSING = {
  bg: "#FFF4E5",
  border: "#F6C77A",
  text: "#8A4B00",
  textDim: "#B4732B",
  dot: "#E8590C",
} as const;

/**
 * Compact amber "Closing in Xm Ys · order soon" urgency banner shown on home while the area is
 * OPEN but its service window closes within 30 min. It SELF-GATES: `useClosingSoonMs` returns
 * null (→ renders nothing) until we're inside that window, and only then ticks per-second — and
 * only while `active` (home focused + app active). So the parent can mount it unconditionally
 * whenever the area is open; it stays invisible + near-free until the last half hour matters.
 */
export function ClosingSoonBanner({
  closesAtEpochMs,
  active = true,
  style,
}: {
  closesAtEpochMs?: number | null;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const remaining = useClosingSoonMs(closesAtEpochMs, active);
  if (remaining == null) return null;
  const { minutes, seconds } = splitTime(remaining);
  const time = minutes > 0 ? `${minutes}m ${pad(seconds)}s` : `${seconds}s`;
  return (
    <View style={[styles.closingBanner, style]}>
      <View style={styles.closingDot} />
      <Ionicons name="time-outline" size={16} color={CLOSING.text} />
      <Text style={styles.closingText} numberOfLines={1}>
        Foodbela closes in <Text style={styles.closingTime}>{time}</Text>
        <Text style={styles.closingSub}> · order soon</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  closingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 6,
    marginBottom: 2,
    backgroundColor: CLOSING.bg,
    borderWidth: 1,
    borderColor: CLOSING.border,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  closingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CLOSING.dot,
  },
  closingText: {
    flexShrink: 1,
    color: CLOSING.text,
    fontSize: 13.5,
    fontWeight: "600",
  },
  closingTime: {
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  closingSub: {
    color: CLOSING.textDim,
    fontSize: 12.5,
    fontWeight: "600",
  },
  hero: {
    overflow: "hidden",
    backgroundColor: CLOSED.bg,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: CLOSED.bgDeeper,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  orbA: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    top: -78,
    right: -46,
  },
  orbB: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: CLOSED.bgDeep,
    opacity: 0.55,
    bottom: -56,
    left: -34,
  },
  heroContent: {
    gap: 7,
  },
  badgeRow: {
    flexDirection: "row",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: CLOSED.bgDeep,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: CLOSED.amber,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: CLOSED.text,
  },
  heroTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: CLOSED.text,
    marginTop: 3,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
    color: CLOSED.textDim,
  },
  timerWrap: {
    marginTop: 13,
    gap: 9,
  },
  timerCaption: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: CLOSED.textDim,
  },
  blocksRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  blockGroup: {
    alignItems: "center",
    gap: 5,
  },
  block: {
    minWidth: 60,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: CLOSED.block,
    borderWidth: 1,
    borderColor: CLOSED.blockBorder,
    alignItems: "center",
  },
  blockValue: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    color: CLOSED.amber,
    fontVariant: ["tabular-nums"],
  },
  blockLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1,
    color: CLOSED.textDim,
  },
  openingText: {
    fontSize: 16,
    fontWeight: "800",
    color: CLOSED.amber,
    marginTop: 2,
  },
  pillContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "94%",
    backgroundColor: CLOSED.bg,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: CLOSED.bgDeeper,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CLOSED.amber,
  },
  pillTextStrong: {
    fontSize: 13,
    fontWeight: "800",
    color: CLOSED.text,
    letterSpacing: 0.1,
  },
  pillTextDim: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "600",
    color: CLOSED.textDim,
  },
  pillTimer: {
    fontSize: 13,
    fontWeight: "900",
    color: CLOSED.amber,
    fontVariant: ["tabular-nums"],
  },
});
