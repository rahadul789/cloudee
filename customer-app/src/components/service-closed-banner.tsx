import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, type Ref, type ReactNode } from "react";
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
import { palette } from "@/src/theme/palette";
import type { AreaServiceWindow } from "@/src/types/restaurant";

// Closed identity: charcoal night card + brand amber accents (matches the home closed card).
const CLOSED = {
  bg: "#1C1F24",
  bgDeeper: "#000000",
  text: "#FFFFFF",
  textDim: "rgba(255, 255, 255, 0.72)",
  amber: "#FFB84C",
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

// "in 2h 15m" / "in 14m 05s" for the closed card. The ticking hook lives here so the
// once-per-second update re-renders only this text — never the whole home screen.
function CountdownText({
  targetEpochMs,
  active = true,
}: {
  targetEpochMs: number | null;
  active?: boolean;
}) {
  const remaining = useCountdownMs(targetEpochMs, active);
  const { hours, minutes, seconds, total } = splitTime(remaining);
  if (total <= 0) return <Text style={styles.cardTimer}>opening shortly</Text>;
  const text = hours > 0 ? `in ${hours}h ${pad(minutes)}m` : `in ${minutes}m ${pad(seconds)}s`;
  return <Text style={styles.cardTimer}>{text}</Text>;
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
 * Compact "Foodbela is closed" card shown in the home scroll flow while the area is outside
 * its service window: moon icon, title, "Opens at 12:00 PM · in 2h 15m", then an optional
 * footer (the "Notify me when open" button). Renders nothing while the area is open.
 * Reports its layout so the screen can reveal the sticky pill once it scrolls away.
 */
export function ServiceClosedHero({
  area,
  showTimer = true,
  timerActive = true,
  onLayout,
  innerRef,
  footer,
}: {
  area?: AreaServiceWindow | null;
  /** Show the live "in 2h 15m" countdown. */
  showTimer?: boolean;
  /** When false the countdown stops ticking (screen unfocused / app backgrounded). */
  timerActive?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  innerRef?: Ref<View>;
  /** Extra content under the header (e.g. the "Notify me when open" button). */
  footer?: ReactNode;
}) {
  if (!area || area.isOpen !== false) return null;

  const hasReopen = typeof area.opensAtEpochMs === "number";

  return (
    <View ref={innerRef} onLayout={onLayout} style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.cardIcon}>
          <Ionicons name="moon" size={20} color={palette.onPrimary} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>Foodbela is closed now</Text>
          <View style={styles.cardSubRow}>
            <Text style={styles.cardSub} numberOfLines={1}>
              {area.opensAtLabel ? `Opens at ${area.opensAtLabel}` : "We'll be back soon"}
            </Text>
            {showTimer && hasReopen ? (
              <>
                <Text style={styles.cardSub}> · </Text>
                <CountdownText targetEpochMs={area.opensAtEpochMs} active={timerActive} />
              </>
            ) : null}
          </View>
        </View>
      </View>
      {footer}
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
  // ── Closed card (home) ──
  card: {
    marginHorizontal: 16,
    padding: 16,
    gap: 14,
    borderRadius: 20,
    backgroundColor: "#1C1F24",
  },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  cardCopy: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: { fontSize: 16.5, lineHeight: 22, fontWeight: "700", color: "#FFFFFF" },
  cardSubRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  cardSub: { fontSize: 13, lineHeight: 18, color: "rgba(255,255,255,0.72)" },
  cardTimer: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: palette.primary },
  closingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 6,
    marginBottom: 2,
    backgroundColor: "#FFE7BE",
    borderWidth: 1.5,
    borderColor: "#EEA23C",
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    // Warm amber lift so the "order soon" urgency banner clearly stands out from the list.
    shadowColor: "#E8590C",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  closingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: CLOSING.dot,
  },
  closingText: {
    flexShrink: 1,
    color: CLOSING.text,
    fontSize: 14.5,
    fontWeight: "700",
  },
  closingTime: {
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  closingSub: {
    color: CLOSING.textDim,
    fontSize: 13,
    fontWeight: "700",
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
    fontWeight: "700",
    color: CLOSED.text,
    letterSpacing: 0.1,
  },
  pillTextDim: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: "500",
    color: CLOSED.textDim,
  },
  pillTimer: {
    fontSize: 13,
    fontWeight: "700",
    color: CLOSED.amber,
    fontVariant: ["tabular-nums"],
  },
});
