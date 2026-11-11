import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { palette } from "@/src/theme/palette";

export type HypeSegment = "all" | "videos" | "drops" | "polls" | "events";

const SEGMENTS: { key: HypeSegment; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "all", label: "For you", icon: "sparkles" },
  { key: "videos", label: "Videos", icon: "play-circle" },
  { key: "drops", label: "Drops", icon: "flash" },
  { key: "polls", label: "Polls", icon: "stats-chart" },
  { key: "events", label: "Events", icon: "calendar" },
];

// Segmented control: an amber pill springs under the active segment (native driver),
// the active icon pops, and a light haptic tick confirms the switch.
export function HypeSegments({
  value,
  onChange,
  counts,
}: {
  value: HypeSegment;
  onChange: (next: HypeSegment) => void;
  counts?: Partial<Record<HypeSegment, number>>;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const index = Math.max(0, SEGMENTS.findIndex((segment) => segment.key === value));
  const slide = useRef(new Animated.Value(index)).current;
  const pops = useRef(SEGMENTS.map((_, i) => new Animated.Value(i === index ? 1 : 0))).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: index,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
    pops.forEach((pop, i) =>
      Animated.spring(pop, {
        toValue: i === index ? 1 : 0,
        damping: 12,
        stiffness: 260,
        useNativeDriver: true,
      }).start(),
    );
  }, [index, pops, slide]);

  const inner = Math.max(0, trackWidth - 8);
  const segmentWidth = inner / SEGMENTS.length;

  return (
    <View
      style={styles.track}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              width: segmentWidth,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: [0, SEGMENTS.length - 1],
                    outputRange: [0, segmentWidth * (SEGMENTS.length - 1)],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {SEGMENTS.map((segment, i) => {
        const active = segment.key === value;
        const count = counts?.[segment.key];
        return (
          <Pressable
            key={segment.key}
            style={styles.segment}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync().catch(() => undefined);
              onChange(segment.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={segment.label}
          >
            <Animated.View
              style={{
                transform: [
                  { scale: pops[i].interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
                  { rotate: pops[i].interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-8deg"] }) },
                ],
              }}
            >
              <Ionicons
                name={active ? segment.icon : (`${segment.icon}-outline` as keyof typeof Ionicons.glyphMap)}
                size={14}
                color={active ? palette.onPrimary : palette.mutedForeground}
              />
            </Animated.View>
            <Text style={[styles.label, active ? styles.labelActive : null]} numberOfLines={1}>
              {segment.label}
            </Text>
            {typeof count === "number" && count > 0 && segment.key !== "all" && !active ? (
              <View style={styles.countDot} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 18,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E3E4E7",
  },
  pill: {
    position: "absolute",
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: 14,
    backgroundColor: palette.primary,
  },
  segment: {
    flex: 1,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: { fontSize: 11.5, fontWeight: "500", color: palette.mutedForeground },
  labelActive: { fontWeight: "700", color: palette.onPrimary },
  countDot: {
    position: "absolute",
    top: 8,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF5A5F",
  },
});
