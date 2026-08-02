import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";

import { styles } from "@/src/components/home/home-screen.styles";
import { PressableScale } from "@/src/components/pressable-scale";
import { RemoteImage } from "@/src/components/remote-image";
import { palette } from "@/src/theme/palette";
import type {
  CustomerHomeTimeBasedSection,
  DiscoverableRestaurant,
} from "@/src/types/restaurant";

function withAlpha(hex: string | undefined, alpha: number) {
  const normalized = (hex ?? "").replace("#", "").trim();
  if (normalized.length !== 3 && normalized.length !== 6) return hex ?? "#FF5C93";
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const alphaHex = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${full}${alphaHex}`;
}

/**
 * The home "live / time-based" restaurant rail. Extracted so it can render either ABOVE or BELOW
 * the Featured row (admin-controlled via `timeBasedSection.placement`) from a single definition —
 * no duplicated JSX. Pure presentational: no data fetching, so its placement has zero perf cost.
 */
export function HomeTimeBasedSection({
  data,
  restaurants,
  accent,
  onPress,
}: {
  data: CustomerHomeTimeBasedSection;
  restaurants: DiscoverableRestaurant[];
  accent: string;
  onPress: (restaurant: DiscoverableRestaurant) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.timeSectionHeader}>
        <View style={styles.timeSectionTitleRow}>
          {data.emoji ? (
            <Text style={styles.timeSectionEmoji}>{data.emoji}</Text>
          ) : (
            <Ionicons
              name={
                (data.icon || "time-outline") as keyof typeof Ionicons.glyphMap
              }
              size={18}
              color={accent}
            />
          )}
          <Text style={styles.timeSectionTitle} numberOfLines={1}>
            {data.title}
          </Text>
          <View
            style={[
              styles.timeSectionLivePill,
              { backgroundColor: withAlpha(accent, 0.14) },
            ]}
          >
            <View
              style={[styles.timeSectionLiveDot, { backgroundColor: accent }]}
            />
            <Text style={[styles.timeSectionLiveText, { color: accent }]}>
              Live
            </Text>
          </View>
        </View>
        {data.subtitle ? (
          <Text style={styles.timeSectionSubtitle} numberOfLines={1}>
            {data.subtitle}
          </Text>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.timeCompactRow}
      >
        {restaurants.map((restaurant) => (
          <PressableScale
            key={restaurant._id}
            scaleTo={0.97}
            containerStyle={styles.timeCompactCard}
            onPress={() => onPress(restaurant)}
          >
            <View style={styles.timeCompactImage}>
              <RemoteImage
                uri={
                  restaurant.coverImage?.url || restaurant.logo?.url || null
                }
                style={{ width: "100%", height: "100%" }}
                fallbackIcon="restaurant-outline"
                accessibilityLabel={restaurant.name}
              />
              {restaurant.isOpen === false ? (
                <View style={styles.timeCompactClosedOverlay}>
                  <View style={styles.timeCompactClosedBadge}>
                    <Ionicons
                      name="lock-closed"
                      size={11}
                      color={palette.foreground}
                    />
                    <Text style={styles.timeCompactClosedBadgeText}>Closed</Text>
                  </View>
                </View>
              ) : null}
            </View>
            <View style={styles.timeCompactCopy}>
              <Text
                style={[
                  styles.timeCompactName,
                  restaurant.isOpen === false
                    ? styles.timeCompactNameClosed
                    : null,
                ]}
                numberOfLines={1}
              >
                {restaurant.name}
              </Text>
              <View style={styles.timeCompactMetaRow}>
                {typeof restaurant.avgRating === "number" &&
                restaurant.avgRating > 0 ? (
                  <>
                    <Ionicons name="star" size={11} color={palette.amber} />
                    <Text style={styles.timeCompactMetaText}>
                      {restaurant.avgRating.toFixed(1)}
                    </Text>
                    {typeof restaurant.distanceKm === "number" ? (
                      <Text style={styles.timeCompactDot}>·</Text>
                    ) : null}
                  </>
                ) : null}
                {typeof restaurant.distanceKm === "number" ? (
                  <Text style={styles.timeCompactMetaText}>
                    {restaurant.distanceKm.toFixed(1)} km
                  </Text>
                ) : null}
              </View>
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}
