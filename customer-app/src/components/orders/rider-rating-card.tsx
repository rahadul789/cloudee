import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getRatingLabel } from "@/src/lib/rating-labels";
import { palette } from "@/src/theme/palette";

type RiderRatingCardProps = {
  value: number;
  onChange: (rating: number) => void;
  comment?: string;
  onCommentChange?: (comment: string) => void;
  riderName?: string | null;
  defaultExpanded?: boolean;
};

/**
 * Collapsed-by-default card to rate the delivery rider. Kept lightweight: the
 * only animation is a single native-driver chevron rotation, so it stays smooth
 * even inside scroll views.
 */
export function RiderRatingCard({
  value,
  onChange,
  comment = "",
  onCommentChange,
  riderName,
  defaultExpanded = false,
}: RiderRatingCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || value > 0);
  const rotation = useRef(
    new Animated.Value(defaultExpanded || value > 0 ? 1 : 0),
  ).current;

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    Animated.timing(rotation, {
      toValue: next ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const chevronRotation = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.header}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel="Rate your ride optional"
      >
        <View style={styles.iconBubble}>
          <Ionicons name="bicycle" size={20} color={palette.sky} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Rate your ride (optional)</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {value > 0
              ? `${getRatingLabel(value)} · ${value}/5`
              : riderName
                ? `How was ${riderName}'s delivery?`
                : "How was your delivery?"}
          </Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <Ionicons name="chevron-down" size={20} color={palette.mutedForeground} />
        </Animated.View>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.starRow}>
            {Array.from({ length: 5 }, (_, index) => {
              const ratingValue = index + 1;
              const active = ratingValue <= value;
              return (
                <Pressable
                  key={`rider-star-${ratingValue}`}
                  onPress={() => onChange(ratingValue)}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.starButton,
                    pressed ? styles.starButtonPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate rider ${ratingValue} star`}
                >
                  <Ionicons
                    name={active ? "star" : "star-outline"}
                    size={30}
                    color={active ? palette.amber : palette.border}
                  />
                </Pressable>
              );
            })}
          </View>
          {onCommentChange ? (
            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={onCommentChange}
              placeholder="Anything about the delivery? (optional)"
              placeholderTextColor={palette.placeholder}
              multiline
              numberOfLines={2}
              maxLength={300}
              textAlignVertical="top"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF1FF",
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: palette.foreground,
  },
  subtitle: {
    fontSize: 12.5,
    color: palette.mutedForeground,
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    paddingTop: 2,
  },
  starRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  starButtonPressed: {
    transform: [{ scale: 0.88 }],
  },
  commentInput: {
    marginTop: 12,
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    color: palette.foreground,
  },
});
